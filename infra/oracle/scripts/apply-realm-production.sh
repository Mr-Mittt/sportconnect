#!/usr/bin/env bash
# INFRA-14: bring the LIVE production realm to the production settings, or check that it is there. Run ON THE BOX as `ubuntu`.
#
#   apply-realm-production.sh check     read-only; prints ok / FAIL per setting; exit 1 if any FAIL (no secret is printed)
#   apply-realm-production.sh apply     sets what `check` looks at (idempotent), then runs `check`
#
# Why this exists: the committed realm file (infra/keycloak/realm/sportconnect-realm.json) is also what the dev Compose Keycloak
# imports, so it keeps the dev values (localhost redirect URIs, the Mailpit sink, a dev secret for `sportconnect-credentials`,
# the dev Swagger client, Google disabled). The production values cannot go in it. They are applied to the live realm through
# the admin API by this script, which wraps the four set-*.sh scripts of the INFRA-12 sandbox, and it is the one place that says
# what production looks like (INFRA-14; a recorded deviation from "mirror every realm change in the realm file").
#
# What production means here:
#   sportconnect-web       only $PUBLIC_URL as root URL, redirect URI (PUBLIC_URL/*), web origin and post-logout redirect
#   sportconnect-swagger   absent (the prod profile does not serve Swagger, INFRA-10)
#   sportconnect-credentials   its secret equals KEYCLOAK_CREDENTIALS_CLIENT_SECRET in ~/web/server.env (never the dev value)
#   smtpServer             host, port, from and user from MAIL_HOST / MAIL_PORT / EMAIL_FROM / MAIL_USERNAME in server.env, auth on
#   master realm           attributes.frontendUrl = $ADMIN_URL (the admin console through the SSH tunnel)
#   sportconnect realm     editUsernameAllowed true (U26)
# Reported, not enforced: registrationAllowed (open on purpose, INFRA-14 decision), the state of the Google provider.
#
# Inputs: ~/.kc-admin-pw (the Keycloak admin password, mode 600, see set-admin-pw.sh) and ~/web/server.env (mode 600). Both are
# read here and sent on stdin; nothing secret is on a command line or printed. The SMTP key is written but cannot be read back
# (Keycloak hides it), so `check` cannot prove it; send a password-reset mail to prove it.
#
# Settings (environment): PUBLIC_URL (https://yoursport.vn), ADMIN_URL (http://localhost:18081), KC_CONTAINER
# (sportconnect-dev-keycloak-1), SERVER_ENV (~/web/server.env), ADMIN_PW_FILE (~/.kc-admin-pw), SCRIPTS (the directory of this file).
#
# Written for INFRA-14. Tested on a throwaway Keycloak, then run on the live A1 realm on 2026-11-03 (`apply` and `check`, all ok).
set -uo pipefail

PUBLIC_URL="${PUBLIC_URL:-https://yoursport.vn}"
ADMIN_URL="${ADMIN_URL:-http://localhost:18081}"
KC_CONTAINER="${KC_CONTAINER:-sportconnect-dev-keycloak-1}"
SERVER_ENV="${SERVER_ENV:-${ENV_DIR:-$HOME/web}/server.env}"
ADMIN_PW_FILE="${ADMIN_PW_FILE:-${ENV_DIR:+$ENV_DIR/kc-admin-pw}}"
ADMIN_PW_FILE="${ADMIN_PW_FILE:-$HOME/.kc-admin-pw}"
GOOGLE_FILE="${GOOGLE_FILE:-${ENV_DIR:+$ENV_DIR/google-oauth}}"   # the Google client of the Vault item google-oauth (INFRA-14), when fetched
SCRIPTS="${SCRIPTS:-$(cd "$(dirname "$0")" && pwd)}"
KCADM=/opt/keycloak/bin/kcadm.sh

die() { echo "apply-realm-production: $*" >&2; exit 1; }
[ -f "$SERVER_ENV" ] || die "$SERVER_ENV not found"
[ -f "$ADMIN_PW_FILE" ] || die "$ADMIN_PW_FILE not found (set-admin-pw.sh writes it)"
envval() { grep -m1 "^$1=" "$SERVER_ENV" | cut -d= -f2-; }
adminpw() { tr -d '\r\n' < "$ADMIN_PW_FILE"; }
for v in MAIL_HOST MAIL_PORT MAIL_USERNAME MAIL_PASSWORD EMAIL_FROM KEYCLOAK_CREDENTIALS_CLIENT_SECRET; do
  [ -n "$(envval $v)" ] || die "$v is empty in $SERVER_ENV"
done

# Runs a script file inside the Keycloak container; stdin of this function is the script's stdin; extra args are `-e NAME=value`.
in_kc() { local f="$1"; shift; docker exec -i "$@" "$KC_CONTAINER" sh -c "$(tr -d '\r' < "$f")"; }

do_apply() {
  echo "== sportconnect-web: redirect URIs"
  adminpw | in_kc "$SCRIPTS/set-web-client-uris.sh" -e "PUBLIC_URL=$PUBLIC_URL" || die "web client step failed"
  echo "== sportconnect-credentials: secret from server.env"
  printf '%s\n%s\n' "$(adminpw)" "$(envval KEYCLOAK_CREDENTIALS_CLIENT_SECRET)" | in_kc "$SCRIPTS/set-credentials-client-secret.sh" || die "credentials client step failed"
  echo "== smtp: $(envval MAIL_HOST):$(envval MAIL_PORT)"
  printf '%s\n%s\n' "$(adminpw)" "$(envval MAIL_PASSWORD)" | in_kc "$SCRIPTS/set-smtp.sh" \
    -e "SMTP_HOST=$(envval MAIL_HOST)" -e "SMTP_PORT=$(envval MAIL_PORT)" -e "SMTP_FROM=$(envval EMAIL_FROM)" -e "SMTP_USER=$(envval MAIL_USERNAME)" || die "smtp step failed"
  echo "== master realm frontendUrl"
  adminpw | in_kc "$SCRIPTS/set-master-frontend-url.sh" -e "ADMIN_URL=$ADMIN_URL" || die "master frontendUrl step failed"
  echo "== remove the dev Swagger client"
  adminpw | docker exec -i "$KC_CONTAINER" sh -c '
    K=/opt/keycloak/bin/kcadm.sh; read -r PW
    $K config credentials --server http://localhost:8080 --realm master --user admin --password "$PW" >/dev/null || exit 1
    ID=$($K get clients -r sportconnect -q clientId=sportconnect-swagger --fields id --format csv --noquotes)
    if [ -n "$ID" ]; then $K delete clients/$ID -r sportconnect && echo "sportconnect-swagger deleted"; else echo "sportconnect-swagger already absent"; fi
    rm -f ~/.keycloak/kcadm.config' || die "swagger step failed"
  echo "== editUsernameAllowed"
  adminpw | docker exec -i "$KC_CONTAINER" sh -c '
    K=/opt/keycloak/bin/kcadm.sh; read -r PW
    $K config credentials --server http://localhost:8080 --realm master --user admin --password "$PW" >/dev/null || exit 1
    $K update realms/sportconnect -s editUsernameAllowed=true && echo "editUsernameAllowed set"
    rm -f ~/.keycloak/kcadm.config' || die "editUsernameAllowed step failed"
}

# The check runs inside the container; it prints one "ok ..." or "FAIL ..." line per setting and never a secret.
read -r -d '' CHECK_SCRIPT <<'EOS'
K=/opt/keycloak/bin/kcadm.sh
read -r PW; read -r CRED; read -r GID
$K config credentials --server http://localhost:8080 --realm master --user admin --password "$PW" >/dev/null || { echo "FAIL cannot log in to the master realm (admin password?)"; exit 2; }
bad=0
flat() { tr -d '\n\r ' ; }
say() { if [ "$1" = ok ]; then echo "ok   $2"; else echo "FAIL $2"; bad=1; fi; }
WID=$($K get clients -r sportconnect -q clientId=sportconnect-web --fields id --format csv --noquotes)
if [ -n "$WID" ]; then
  W=$($K get clients/$WID -r sportconnect | flat)
  case "$W" in *"\"redirectUris\":[\"$PUBLIC_URL/*\"]"*) say ok "web redirect URIs are exactly $PUBLIC_URL/*" ;; *) say FAIL "web redirect URIs are not exactly $PUBLIC_URL/*" ;; esac
  case "$W" in *"\"webOrigins\":[\"$PUBLIC_URL\"]"*) say ok "web origins are exactly $PUBLIC_URL" ;; *) say FAIL "web origins are not exactly $PUBLIC_URL" ;; esac
  case "$W" in *"\"post.logout.redirect.uris\":\"$PUBLIC_URL/*\""*) say ok "post-logout redirect is $PUBLIC_URL/*" ;; *) say FAIL "post-logout redirect is not $PUBLIC_URL/*" ;; esac
else say FAIL "client sportconnect-web not found"; fi
SID=$($K get clients -r sportconnect -q clientId=sportconnect-swagger --fields id --format csv --noquotes)
if [ -z "$SID" ]; then say ok "sportconnect-swagger is absent"; else say FAIL "sportconnect-swagger still exists"; fi
CID=$($K get clients -r sportconnect -q clientId=sportconnect-credentials --fields id --format csv --noquotes)
if [ -n "$CID" ]; then
  GOT=$($K get clients/$CID/client-secret -r sportconnect --fields value --format csv --noquotes)
  if [ "$GOT" = "$CRED" ]; then say ok "credentials client secret equals server.env"; else say FAIL "credentials client secret differs from server.env"; fi
  if [ "$GOT" = "dev-credentials-client-secret" ]; then say FAIL "credentials client still has the dev secret"; fi
else say FAIL "client sportconnect-credentials not found"; fi
R=$($K get realms/sportconnect | flat)
S=$(printf '%s' "$R" | sed -n 's/.*"smtpServer":{\([^}]*\)}.*/\1/p')
case "$S" in *"\"host\":\"$SMTP_HOST\""*) say ok "smtp host is $SMTP_HOST" ;; *) say FAIL "smtp host is not $SMTP_HOST" ;; esac
case "$S" in *"\"port\":\"$SMTP_PORT\""*) say ok "smtp port is $SMTP_PORT" ;; *) say FAIL "smtp port is not $SMTP_PORT" ;; esac
case "$S" in *"\"from\":\"$SMTP_FROM\""*) say ok "smtp from is $SMTP_FROM" ;; *) say FAIL "smtp from is not $SMTP_FROM" ;; esac
case "$S" in *"\"user\":\"$SMTP_USER\""*) say ok "smtp user is set" ;; *) say FAIL "smtp user differs" ;; esac
case "$S" in *'"auth":"true"'*) say ok "smtp auth is on" ;; *) say FAIL "smtp auth is off" ;; esac
case "$R" in *'"editUsernameAllowed":true'*) say ok "editUsernameAllowed is true" ;; *) say FAIL "editUsernameAllowed is not true" ;; esac
case "$R" in *'"registrationAllowed":true'*) echo "info registration is OPEN (decision: left open)" ;; *) echo "info registration is CLOSED" ;; esac
M=$($K get realms/master | flat)
case "$M" in *"\"frontendUrl\":\"$ADMIN_URL\""*) say ok "master frontendUrl is $ADMIN_URL" ;; *) say FAIL "master frontendUrl is not $ADMIN_URL" ;; esac
G=$($K get identity-provider/instances/google -r sportconnect 2>/dev/null | flat)
case "$G" in *'"enabled":true'*) echo "info google provider is ENABLED" ;; *'"alias":"google"'*) echo "info google provider exists but is DISABLED" ;; *) echo "info google provider does not exist" ;; esac
# INFRA-14: the client id is readable (the secret is hidden by Keycloak); GID is the id in the Vault item google-oauth, empty when the box has none
if [ -z "$GID" ]; then echo "info no google-oauth item fetched: the provider's client id is not compared"
else case "$G" in *"\"clientId\":\"$GID\""*) say ok "google provider client id equals the one in the Vault item" ;; *) say FAIL "google provider client id differs from the Vault item (or the provider is missing)" ;; esac; fi
rm -f ~/.keycloak/kcadm.config
exit $bad
EOS

do_check() {
  local gid=""
  [ -n "$GOOGLE_FILE" ] && [ -f "$GOOGLE_FILE" ] && gid="$(tr -d '\r\n' < "$GOOGLE_FILE" | cut -d: -f1)"
  printf '%s\n%s\n%s\n' "$(adminpw)" "$(envval KEYCLOAK_CREDENTIALS_CLIENT_SECRET)" "$gid" | docker exec -i \
    -e "PUBLIC_URL=$PUBLIC_URL" -e "ADMIN_URL=$ADMIN_URL" -e "SMTP_HOST=$(envval MAIL_HOST)" -e "SMTP_PORT=$(envval MAIL_PORT)" \
    -e "SMTP_FROM=$(envval EMAIL_FROM)" -e "SMTP_USER=$(envval MAIL_USERNAME)" "$KC_CONTAINER" sh -c "$CHECK_SCRIPT"
  local rc=$?
  [ "$rc" = 0 ] && echo "== production realm: all checks passed" || echo "== production realm: SOME CHECKS FAILED"
  return "$rc"
}

case "${1:-}" in
  check) do_check ;;
  apply) do_apply && do_check ;;
  *) sed -n '2,5p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
