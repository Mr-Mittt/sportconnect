#!/usr/bin/env bash
# INFRA-25: tests for the realm roles of the production realm: infra/oracle/scripts/set-realm-roles.sh, the roles lines of
# `apply-realm-production.sh check`, and that `apply` runs the roles step.
#
#   infra/scripts/test-realm-roles.sh
#
# Needs Docker, Node 18+, curl and the built Keycloak extensions JAR (infra/scripts/build-keycloak-extensions.sh; the committed realm
# names its providers). It starts, and removes at the end, one throwaway Keycloak 26.4 with the committed realm on :8094
# (ROLES_TEST_KC_PORT), admin password "roles-admin-password-1". It never touches the dev Compose stack.
# What it cannot prove: the real `sportconnect-web` client's token (that is checked when A37 ships), and anything on the box (guide § 6).
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$here/../.."
SC="$repo/infra/oracle/scripts"
KC_PORT="${ROLES_TEST_KC_PORT:-8094}"
KC_NAME="sportconnect-roles-test-keycloak"
KC_IMAGE="quay.io/keycloak/keycloak:26.4"
export MSYS_NO_PATHCONV=1
native() { (cd "$1" && (pwd -W 2>/dev/null || pwd)); }

work="$(mktemp -d)"
cleanup() { docker rm -f "$KC_NAME" >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT

pass=0; fail=0; OUT=""; RC=0
ok() { echo "ok    $1"; pass=$((pass+1)); }
no() { echo "FAIL  $1"; echo "      output: $(printf '%s' "$OUT" | tr '\n' ' ' | cut -c1-400)"; fail=$((fail+1)); }
run() { OUT="$("$@" 2>&1)"; RC=$?; }
rc0() { if [ "$RC" = 0 ]; then ok "$1"; else no "$1 (exit $RC, wanted 0)"; fi; }
has() { case "$OUT" in *"$1"*) ok "$2" ;; *) no "$2 (missing: $1)" ;; esac; }
hasnt() { case "$OUT" in *"$1"*) no "$2 (found: $1)" ;; *) ok "$2" ;; esac; }

for t in docker node curl; do command -v "$t" >/dev/null || { echo "test-realm-roles: $t is not on PATH" >&2; exit 2; }; done
docker info >/dev/null 2>&1 || { echo "test-realm-roles: the Docker daemon is not running" >&2; exit 2; }
EXT_JAR="${EXTENSION_JAR:-$repo/infra/keycloak/providers/sportconnect-keycloak-extensions.jar}"
[ -f "$EXT_JAR" ] || { echo "test-realm-roles: $EXT_JAR not found (infra/scripts/build-keycloak-extensions.sh)" >&2; exit 2; }

# ---- the throwaway Keycloak and the environment the scripts under test see ----
mkdir -p "$work/env" "$work/providers"
cp "$EXT_JAR" "$work/providers/sportconnect-keycloak-extensions.jar"
chmod 755 "$work" "$work/providers"; chmod 644 "$work/providers/"*.jar
docker rm -f "$KC_NAME" >/dev/null 2>&1 || true
docker run -d --name "$KC_NAME" -p "127.0.0.1:$KC_PORT:8080" \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD=roles-admin-password-1 -e KC_HOSTNAME="http://localhost:$KC_PORT" \
  -v "$(native "$repo/infra/keycloak/realm")/sportconnect-realm.json:/opt/keycloak/data/import/sportconnect-realm.json:ro" \
  -v "$(native "$work/providers"):/opt/keycloak/providers:ro" "$KC_IMAGE" start-dev --import-realm >/dev/null || { echo "could not start Keycloak" >&2; exit 2; }
echo "waiting for Keycloak on :$KC_PORT ..."
ready=0
for _ in $(seq 1 120); do curl -fsS "http://localhost:$KC_PORT/realms/sportconnect/.well-known/openid-configuration" >/dev/null 2>&1 && { ready=1; break; }; sleep 2; done
[ "$ready" = 1 ] || { echo "Keycloak did not come up:" >&2; docker logs --tail 30 "$KC_NAME" >&2; exit 2; }

ADMIN="roles-admin-password-1"
printf '%s\n' "$ADMIN" > "$work/env/kc-admin-pw"
cat > "$work/env/server.env" <<EOF
MAIL_HOST=127.0.0.1
MAIL_PORT=1025
MAIL_USERNAME=sc-user
MAIL_PASSWORD=good-pass
EMAIL_FROM=noreply@example.test
KEYCLOAK_CREDENTIALS_CLIENT_SECRET=a-test-credentials-secret
EOF

# kcq <admin password> <kcadm command with $K>: runs it inside the Keycloak container after a login
kcq() {
  local pw="$1"; shift
  printf '%s\n' "$pw" | docker exec -i "$KC_NAME" sh -c 'read -r P; K=/opt/keycloak/bin/kcadm.sh
    $K config credentials --server http://localhost:8080 --realm master --user admin --password "$P" >/dev/null 2>&1 && { '"$*"'; }
    rc=$?; rm -f ~/.keycloak/kcadm.config; exit $rc'
}
setroles() { printf '%s\n' "$ADMIN" | docker exec -i "$KC_NAME" sh -c "$(tr -d '\r' < "$SC/set-realm-roles.sh")"; }
envp() { ENV_DIR="$work/env" KC_CONTAINER="$KC_NAME" PUBLIC_URL=https://example.test ADMIN_URL=http://localhost:18081 SCRIPTS="$SC" bash "$SC/apply-realm-production.sh" "$@"; }
chk() { envp check; }
apl() { envp apply; }

echo "== set-realm-roles.sh and the roles lines of check"
# two real users: role-a holds the realm default role (every normal registration does), role-b does not (an imported or hand-made account)
kcq "$ADMIN" '$K create users -r sportconnect -s username=role-a@example.test -s email=role-a@example.test -s enabled=true >/dev/null 2>&1
  $K create users -r sportconnect -s username=role-b@example.test -s email=role-b@example.test -s enabled=true >/dev/null 2>&1
  B=$($K get users -r sportconnect -q username=role-b@example.test --fields id --format csv --noquotes)
  $K remove-roles -r sportconnect --uid $B --rolename default-roles-sportconnect' >/dev/null 2>&1
run chk
has "FAIL realm role USER does not exist" "before: check fails while the USER role is missing"
has "FAIL realm role ADMIN does not exist" "before: and while ADMIN is missing"
has "FAIL USER is not in the realm default role" "before: and while USER is not in the default role"
has "FAIL 2 of 2 real users lack USER" "before: and counts the users without USER"
has "info ADMIN members: none" "before: ADMIN members are listed as info (none), never a failure"
run setroles; rc0 "the first run succeeds"
has "role USER created" "it creates USER"; has "role ADMIN created" "and ADMIN"
has "USER added to the realm default role" "and adds USER to the realm default role"
has "users: 2 checked, 1 already had USER, 1 fixed, 0 failed" "the user with the default role already has USER; the one without is fixed"
run setroles; rc0 "a second run succeeds"
has "role USER exists" "it finds USER again"; has "USER is already in the realm default role" "and the default-role entry"
has "users: 2 checked, 2 already had USER, 0 fixed, 0 failed" "and changes nothing"
run chk
has "ok   realm role USER exists" "after: check sees USER"; has "ok   realm role ADMIN exists" "and ADMIN"
has "ok   USER is in the realm default role" "and USER in the default role"; has "ok   all 2 real users hold USER" "and every real user holding USER"
has "info ADMIN members: none" "ADMIN has no members until the owner grants it"

echo "== the claim the backend reads (realm_access.roles)"
# a password grant through the credentials client (directAccessGrants) gives an access token with the user's effective realm roles
tokroles() {   # tokroles <user>: the realm roles in the access token, space separated
  kcq "$ADMIN" '$K set-password -r sportconnect --username '"$1"' --new-password Test-pass-12345' >/dev/null 2>&1
  curl -fsS -X POST "http://localhost:$KC_PORT/realms/sportconnect/protocol/openid-connect/token" -d grant_type=password -d client_id=sportconnect-credentials \
    -d client_secret=dev-credentials-client-secret --data-urlencode "username=$1" --data-urlencode "password=Test-pass-12345" 2>/dev/null \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const t=JSON.parse(s).access_token;console.log(((JSON.parse(Buffer.from(t.split(".")[1],"base64url")).realm_access||{}).roles||[]).sort().join(" "))}catch(e){console.log("NO-TOKEN")}})'
}
OUT="$(tokroles role-a@example.test)"; has "USER" "a user with the default role has USER in the token"; hasnt "ADMIN" "and not ADMIN"
OUT="$(tokroles role-b@example.test)"; has "USER" "the user fixed directly has USER in the token too"
kcq "$ADMIN" '$K add-roles -r sportconnect --uusername role-a@example.test --rolename ADMIN' >/dev/null 2>&1
OUT="$(tokroles role-a@example.test)"; has "ADMIN" "granting ADMIN by hand puts it in the token"
run chk; has "info ADMIN members: role-a@example.test" "check lists the ADMIN member"
kcq "$ADMIN" '$K remove-roles -r sportconnect --uusername role-a@example.test --rolename ADMIN' >/dev/null 2>&1

echo "== apply-realm-production.sh apply runs the roles step"
kcq "$ADMIN" '$K remove-roles -r sportconnect --rname default-roles-sportconnect --rolename USER' >/dev/null 2>&1
run chk; has "FAIL USER is not in the realm default role" "with USER taken out of the default role, check fails"
run apl; rc0 "apply succeeds"
has "== realm roles (INFRA-25)" "apply runs the realm roles step"
has "USER added to the realm default role" "and puts USER back into the default role"
has "users: 2 checked" "and runs the backfill"
has "ok   USER is in the realm default role" "and its own check sees the default role again"
has "ok   all 2 real users hold USER" "and every real user holding USER"
has "all checks passed" "and the whole production check passes"

echo
echo "passed: $pass   failed: $fail"
[ "$fail" = 0 ]
