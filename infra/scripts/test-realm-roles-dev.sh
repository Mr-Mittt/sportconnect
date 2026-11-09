#!/usr/bin/env bash
# A37: tests for the LOCAL (dev) realm roles tooling: infra/scripts/realm-roles.mjs (api and file modes), apply-realm-roles.sh and
# verify-realm-roles.mjs. (The production twin, set-realm-roles.sh, is tested by test-realm-roles.sh, INFRA-25.)
#
#   infra/scripts/test-realm-roles-dev.sh
#
# Needs Docker, Node 18+, curl and the built Keycloak extensions JAR (infra/scripts/build-keycloak-extensions.sh; the committed realm
# names its providers). It starts, and removes at the end, a throwaway Keycloak 26.4 on :8095 (ROLES_DEV_TEST_KC_PORT), twice: first with
# the committed realm file stripped of its roles (a realm created before A37, which `api` must bring up to date), then with the realm file
# `file` mode wrote (which must import with the roles in place). It never touches the dev Compose stack.
# What it cannot prove: a real browser sign-in; the web client's token is checked with Keycloak's own "evaluate" endpoint instead.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$here/../.."
KC_PORT="${ROLES_DEV_TEST_KC_PORT:-8095}"
KC_NAME="sportconnect-roles-dev-test-keycloak"
KC_IMAGE="quay.io/keycloak/keycloak:26.4"
ADMIN_PW="roles-dev-admin-password-1"
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
rc1() { if [ "$RC" = 1 ]; then ok "$1"; else no "$1 (exit $RC, wanted 1)"; fi; }
has() { case "$OUT" in *"$1"*) ok "$2" ;; *) no "$2 (missing: $1)" ;; esac; }
hasnt() { case "$OUT" in *"$1"*) no "$2 (found: $1)" ;; *) ok "$2" ;; esac; }

for t in docker node curl; do command -v "$t" >/dev/null || { echo "test-realm-roles-dev: $t is not on PATH" >&2; exit 2; }; done
docker info >/dev/null 2>&1 || { echo "test-realm-roles-dev: the Docker daemon is not running" >&2; exit 2; }
EXT_JAR="${EXTENSION_JAR:-$repo/infra/keycloak/providers/sportconnect-keycloak-extensions.jar}"
[ -f "$EXT_JAR" ] || { echo "test-realm-roles-dev: $EXT_JAR not found (infra/scripts/build-keycloak-extensions.sh)" >&2; exit 2; }

mkdir -p "$work/providers"
cp "$EXT_JAR" "$work/providers/sportconnect-keycloak-extensions.jar"
chmod 755 "$work" "$work/providers"; chmod 644 "$work/providers/"*.jar

# the committed realm file as it was before A37: no roles, no default role entry
node -e '
const fs = require("fs");
const r = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
delete r.roles; delete r.defaultRole;
fs.writeFileSync(process.argv[2], JSON.stringify(r, null, 2));
' "$(native "$repo/infra/keycloak/realm")/sportconnect-realm.json" "$(native "$work")/old-realm.json"

start_kc() {   # start_kc <realm json in $work>
  docker rm -f "$KC_NAME" >/dev/null 2>&1 || true
  docker run -d --name "$KC_NAME" -p "127.0.0.1:$KC_PORT:8080" \
    -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD="$ADMIN_PW" -e KC_HOSTNAME="http://localhost:$KC_PORT" \
    -v "$(native "$work")/$1:/opt/keycloak/data/import/sportconnect-realm.json:ro" \
    -v "$(native "$work")/providers:/opt/keycloak/providers:ro" "$KC_IMAGE" start-dev --import-realm >/dev/null || { echo "could not start Keycloak" >&2; exit 2; }
  local ready=0
  for _ in $(seq 1 120); do curl -fsS "http://localhost:$KC_PORT/realms/sportconnect/.well-known/openid-configuration" >/dev/null 2>&1 && { ready=1; break; }; sleep 2; done
  [ "$ready" = 1 ] || { echo "Keycloak did not come up:" >&2; docker logs --tail 30 "$KC_NAME" >&2; exit 2; }
}
kcq() {   # kcq <kcadm command with $K>: runs it inside the Keycloak container after a login
  printf '%s\n' "$ADMIN_PW" | docker exec -i "$KC_NAME" sh -c 'read -r P; K=/opt/keycloak/bin/kcadm.sh
    $K config credentials --server http://localhost:8080 --realm master --user admin --password "$P" >/dev/null 2>&1 && { '"$*"'; }
    rc=$?; rm -f ~/.keycloak/kcadm.config; exit $rc'
}
export KEYCLOAK_URL="http://localhost:$KC_PORT" KEYCLOAK_ADMIN=admin KEYCLOAK_ADMIN_PASSWORD="$ADMIN_PW"
# Node is a Windows program: Git Bash translates /d/... paths for it only while MSYS_NO_PATHCONV is unset (it is set above for the Docker arguments).
apply() { env -u MSYS_NO_PATHCONV bash "$here/apply-realm-roles.sh"; }
verify() { env -u MSYS_NO_PATHCONV node "$here/verify-realm-roles.mjs"; }
mkusers() {   # role-a keeps the realm default role; role-b has it taken away (an account created some other way)
  kcq '$K create users -r sportconnect -s username=role-a@example.test -s email=role-a@example.test -s enabled=true >/dev/null 2>&1
    $K create users -r sportconnect -s username=role-b@example.test -s email=role-b@example.test -s enabled=true >/dev/null 2>&1
    B=$($K get users -r sportconnect -q username=role-b@example.test --fields id --format csv --noquotes)
    $K remove-roles -r sportconnect --uid $B --rolename default-roles-sportconnect' >/dev/null 2>&1
}

echo "waiting for Keycloak (a realm from before A37) on :$KC_PORT ..."
start_kc old-realm.json
mkusers

echo "== api: a realm from before A37"
run verify; rc1 "verify fails before apply"
has "FAIL realm role USER exists" "it names the missing USER role"
has "FAIL USER is in the realm default role" "and the default role"
run apply; rc0 "apply succeeds"
has "role USER created" "it creates USER"; has "role ADMIN created" "and ADMIN"
has "USER added to the realm default role" "and puts USER in the default role"
has "users: 2 checked, 1 already had USER, 1 fixed, 0 failed" "the user with the default role is fine, the one without gets USER"
run apply; rc0 "a second apply succeeds"
has "role USER exists" "it finds the roles again"; has "USER is already in the realm default role" "and the default role entry"
has "users: 2 checked, 2 already had USER, 0 fixed, 0 failed" "and changes nothing"
run verify; rc0 "verify passes after apply"
has "ok   realm role ADMIN exists" "ADMIN exists"; has "ok   all 2 real users hold USER" "every real user holds USER"
has "the sportconnect-web access token carries USER in realm_access.roles" "the real web client's token carries USER"
has "info ADMIN members: none" "ADMIN is empty until it is granted by hand"
kcq '$K add-roles -r sportconnect --uusername role-a@example.test --rolename ADMIN' >/dev/null 2>&1
run verify; rc0 "verify still passes once ADMIN is granted"
has "info ADMIN members: role-a@example.test" "and lists who holds ADMIN"

echo "== file: the realm file gets the same roles"
cp "$work/old-realm.json" "$work/new-realm.json"
run env -u MSYS_NO_PATHCONV REALM_FILE="$(native "$work")/new-realm.json" node "$here/realm-roles.mjs" file; rc0 "file mode succeeds"
has "roles USER, ADMIN" "it writes the roles"
cp "$work/new-realm.json" "$work/new-realm.once.json"
run env -u MSYS_NO_PATHCONV REALM_FILE="$(native "$work")/new-realm.json" node "$here/realm-roles.mjs" file; rc0 "file mode runs again"
if cmp -s "$work/new-realm.json" "$work/new-realm.once.json"; then ok "and the file does not change (idempotent)"; else no "and the file does not change (idempotent)"; fi
# the committed realm file must already contain them (the realm-change rule: the file mirrors the live realm)
OUT="$(node -e '
const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const names = (r.roles?.realm ?? []).map((x) => x.name);
const dflt = (r.roles?.realm ?? []).find((x) => x.name === "default-roles-sportconnect");
console.log([names.includes("USER"), names.includes("ADMIN"), r.defaultRole?.name === "default-roles-sportconnect", dflt?.composites?.realm?.includes("USER")].join(","));
' "$(native "$repo/infra/keycloak/realm")/sportconnect-realm.json")"
if [ "$OUT" = "true,true,true,true" ]; then ok "the committed sportconnect-realm.json carries USER, ADMIN and USER in the default role"; else no "the committed sportconnect-realm.json carries USER, ADMIN and USER in the default role (got $OUT)"; fi

echo "== a fresh Keycloak imports the realm file written by file mode"
start_kc new-realm.json
kcq '$K create users -r sportconnect -s username=fresh@example.test -s email=fresh@example.test -s enabled=true >/dev/null 2>&1' >/dev/null 2>&1
run verify; rc0 "verify passes on a realm imported from the file, with no apply at all"
has "ok   realm role USER exists" "USER came from the import"; has "ok   USER is in the realm default role" "and the default role has it"
has "ok   all 1 real users hold USER" "a user created afterwards holds USER"
has "the sportconnect-web access token carries USER in realm_access.roles" "and its web client token carries it"
run apply; rc0 "apply on that realm succeeds"
has "users: 1 checked, 1 already had USER, 0 fixed, 0 failed" "and has nothing to fix"

echo
echo "passed: $pass   failed: $fail"
[ "$fail" = 0 ]
