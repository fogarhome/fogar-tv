#!/bin/bash
# Comprobación de salud de fogar-tv. No cambia nada. Sale con 0 si todo va bien y con 1 si algo falla.
# Ver «scripts/doctor.sh --help».
set -uo pipefail

case ${1:-} in
  -h|--help)
    cat <<'EOF'
Uso: scripts/doctor.sh [--since MINUTOS]

Comprueba, sin cambiar nada: la configuración, los servicios (fogar-tv, fogar-tv-mdns si hay alias,
fogar-tv-spotify si está habilitado, fogar-tv-kiosk), que el servidor haya conectado con Chrome
(«CDP conectado» en el registro), que /api/state responda 200 con cdp:true usando el token de TV_STATE_DIR
y 401 sin token, que la tele esté conectada con Fogar (el gateway), que el token no aparezca en el registro reciente (por defecto, 15 minutos), los permisos
del estado (0700 la carpeta, 0600 los ficheros), que CDP solo escuche en 127.0.0.1, el alias mDNS y, si TV_ADB está puesto, que la tele responda por ADB.
Nunca enseña el token ni la clave del gateway.
EOF
    exit 0 ;;
  --since) SINCE=${2:?falta MINUTOS}; shift 2 ;;
  '') ;;
  *) echo "opción desconocida: $1 (ver --help)" >&2; exit 2 ;;
esac
: "${SINCE:=15}"

# shellcheck source=scripts/lib.sh
. "$(dirname "$(readlink -f "$0")")/lib.sh"
CFG=$(fogar_tv_config_path)
fogar_tv_load_config

FAIL=0
ok() { printf '✓ %s\n' "$*"; }
bad() { printf '✗ %s\n' "$*"; FAIL=$((FAIL + 1)); }
note() { printf '  %s\n' "$*"; }

# ─── configuración
if [ -r "$CFG" ]; then ok "configuración en $CFG"; else bad "no está $CFG (scripts/install.sh la crea)"; fi

# ─── servicios
user_sd=0
if systemctl --user show-environment >/dev/null 2>&1; then user_sd=1; else bad "systemctl --user no responde (¿sesión sin systemd de usuario?)"; fi
active() { # active <unidad> [--user]
  if systemctl "${@:2}" is-active --quiet "$1"; then ok "$1 activo"
  else bad "$1 no está activo ($(systemctl "${@:2}" is-active "$1" 2>/dev/null)); mira: journalctl ${2:+--user }-u $1 -n 50"; fi
}
if [ $user_sd = 1 ]; then
  active fogar-tv.service --user
  if [ -n "$TV_MDNS_NAME" ]; then active fogar-tv-mdns.service --user; fi
  if systemctl --user is-enabled --quiet fogar-tv-spotify.service 2>/dev/null; then active fogar-tv-spotify.service --user; fi
  for old in tv-remote tv-mdns; do
    systemctl --user is-active --quiet "$old.service" 2>/dev/null && bad "la unidad antigua $old.service sigue activa (systemctl --user disable --now $old)"
  done
fi
active fogar-tv-kiosk.service
systemctl is-active --quiet tv-kiosk.service 2>/dev/null && bad "la unidad antigua tv-kiosk.service sigue activa (sudo systemctl disable --now tv-kiosk)"

# ─── registro: CDP conectado desde el último arranque del servidor
if [ $user_sd = 1 ]; then
  inv=$(systemctl --user show -p InvocationID --value fogar-tv.service 2>/dev/null)
  if [ -n "$inv" ] && journalctl --user _SYSTEMD_INVOCATION_ID="$inv" -o cat --no-pager 2>/dev/null | grep -q 'CDP conectado'; then
    ok "el servidor ha conectado con Chrome («CDP conectado»)"
  elif journalctl --user -u fogar-tv.service -b -o cat --no-pager 2>/dev/null | grep -q 'CDP conectado'; then
    ok "«CDP conectado» en el registro de este arranque"
  else
    bad "no veo «CDP conectado» en el registro de fogar-tv (¿kiosco parado o TV_CDP_PORT distinto?)"
    note "si journalctl --user no enseña nada, puede faltar permiso para leer el journal (grupo systemd-journal)"
  fi
fi

# ─── API: con token → 200 y cdp:true; sin token → 401. El token se lee del fichero dentro de node.
TOKEN_FILE=$TV_STATE_DIR/token
NODE=$(fogar_tv_find_node || true)
if [ -z "$NODE" ]; then
  bad "no encuentro node para probar la API"
elif [ ! -r "$TOKEN_FILE" ]; then
  bad "no está $TOKEN_FILE (el servidor lo crea, o lo trae de remote/token de una instalación antigua, al arrancar)"
else
  res=$("$NODE" - "$TV_PORT" "$TOKEN_FILE" <<'EOF'
const [port, file] = process.argv.slice(2);
const tok = require('node:fs').readFileSync(file, 'utf8').trim();
const url = `http://127.0.0.1:${port}/api/state`;
const get = h => fetch(url, { headers: h, signal: AbortSignal.timeout(4000) });
(async () => {
  try {
    const a = await get({ Authorization: 'Bearer ' + tok });
    let cdp = '?';
    try { cdp = String((await a.json()).cdp); } catch {}
    const b = await get({});
    // Fogar (el gateway): lo comprueba ahora; solo el estado y el nombre, nunca la clave
    let gw = '? ';
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/cmd`, { method: 'POST', signal: AbortSignal.timeout(9000),
        headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ t: 'gateway', op: 'check' }) });
      const j = await r.json();
      gw = `${j.status || '?'} ${String(j.name || j.host || '').replace(/\s+/g, ' ')}`;
    } catch {}
    console.log(a.status, cdp, b.status, gw);
  } catch (e) { console.log('error', e.cause?.code || e.name); }
})();
EOF
)
  read -r st cdp st0 gws gwn <<<"$res"
  if [ "$st" = error ]; then bad "el servidor no responde en 127.0.0.1:$TV_PORT ($cdp)"
  else
    if [ "$st" = 200 ] && [ "$cdp" = true ]; then ok "/api/state con token: 200, cdp:true"
    elif [ "$st" = 200 ]; then bad "/api/state con token: 200 pero cdp:$cdp (el servidor no tiene a Chrome)"
    else bad "/api/state con token: $st (esperaba 200; ¿token distinto del que usa el servidor?)"; fi
    if [ "$st0" = 401 ]; then ok "/api/state sin token: 401"; else bad "/api/state sin token: $st0 (esperaba 401)"; fi
    case "$gws" in
      ok) ok "Fogar: conectada a ${gwn:-el gateway}" ;;
      unpaired) bad "Fogar: la tele no está emparejada (en el mando: Ajustes › Fogar en la tele › Conexión)" ;;
      unreachable) bad "Fogar: el gateway${gwn:+ de $gwn} no responde" ;;
      revoked) bad "Fogar: el gateway rechazó la clave; vuelve a emparejar desde el mando" ;;
      refused) bad "Fogar: el gateway no deja usar el agente de la tele (TV_AGENT); revisa los agentes permitidos del cliente" ;;
      *) bad "Fogar: no he podido saber el estado de la conexión ($gws)" ;;
    esac
  fi
fi

# ─── el token no sale en el registro reciente
if [ -r "$TOKEN_FILE" ]; then
  pat=$(mktemp)
  tr -d '[:space:]' <"$TOKEN_FILE" >"$pat"
  if [ ! -s "$pat" ]; then bad "$TOKEN_FILE está vacío"
  else
    leaked=0
    for scope in --user --system; do
      journalctl "$scope" --since "-${SINCE}min" -o cat --no-pager 2>/dev/null | grep -qFf "$pat" && leaked=1
    done
    if [ $leaked = 1 ]; then bad "¡el token maestro aparece en el registro de los últimos $SINCE minutos! (cámbialo: borra $TOKEN_FILE y reinicia)"
    else ok "el token no aparece en el registro de los últimos $SINCE minutos"; fi
  fi
  rm -f "$pat"
fi

# ─── permisos del estado
if [ -d "$TV_STATE_DIR" ]; then
  m=$(fogar_tv_mode "$TV_STATE_DIR")
  if [ "$m" = 700 ]; then ok "$TV_STATE_DIR es 0700"; else bad "$TV_STATE_DIR es 0$m (debe ser 0700: chmod 700 $TV_STATE_DIR)"; fi
  perm_bad=()
  for f in "$TV_STATE_DIR"/*; do
    [ -f "$f" ] || continue
    [ "$(fogar_tv_mode "$f")" = 600 ] || perm_bad+=("$(basename "$f") ($(fogar_tv_mode "$f"))")
  done
  if [ ${#perm_bad[@]} -eq 0 ]; then ok "ficheros del estado en 0600"
  else bad "ficheros del estado sin 0600: ${perm_bad[*]} (chmod 600 …)"; fi
else
  bad "no existe la carpeta de estado $TV_STATE_DIR"
fi

# ─── CDP solo en 127.0.0.1
if command -v ss >/dev/null 2>&1; then
  binds=$(ss -Hltn "sport = :$TV_CDP_PORT" 2>/dev/null | awk '{print $4}' | sort -u | tr '\n' ' ')
  if [ -z "$binds" ]; then bad "nadie escucha en el puerto CDP $TV_CDP_PORT (¿kiosco parado?)"
  elif printf '%s' "$binds" | tr ' ' '\n' | grep -v '^$' | grep -qv '^127\.0\.0\.1:'; then bad "CDP escucha fuera de 127.0.0.1: $binds"
  else ok "CDP en 127.0.0.1:$TV_CDP_PORT"; fi
fi

# ─── tele por ADB (solo con TV_ADB)
if [ -n "${TV_ADB:-}" ]; then
  if ! command -v adb >/dev/null 2>&1; then bad "TV_ADB está puesto pero falta adb (sudo apt install adb)"
  elif [ "$(timeout 5 adb -s "$TV_ADB" get-state 2>/dev/null)" = device ]; then ok "tele por ADB: $TV_ADB"
  else bad "la tele no responde por ADB en $TV_ADB (adb connect $TV_ADB y «Permitir siempre» en la tele)"; fi
  if [ -z "${TV_INPUT:-}" ]; then bad "TV_INPUT vacío: con TV_ADB hace falta la entrada HDMI de Fogar TV (p. ej. com.mediatek.tvinput/.hdmi.HDMIInputService/HW4)"; fi
fi

# ─── alias mDNS
if [ -n "$TV_MDNS_NAME" ]; then
  if command -v avahi-resolve-host-name >/dev/null 2>&1; then
    if r=$(timeout 5 avahi-resolve-host-name -4 "$TV_MDNS_NAME" 2>/dev/null) && [ -n "$r" ]; then ok "mDNS: $r"
    else bad "mDNS: $TV_MDNS_NAME no se resuelve"; fi
  elif r=$(timeout 5 getent hosts "$TV_MDNS_NAME" 2>/dev/null) && [ -n "$r" ]; then ok "mDNS: $r"
  else bad "mDNS: $TV_MDNS_NAME no se resuelve (instala avahi-utils para comprobarlo mejor)"; fi
fi

echo
if [ $FAIL = 0 ]; then echo "Todo bien."; exit 0; fi
echo "$FAIL comprobaciones fallidas."
exit 1
