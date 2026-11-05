#!/usr/bin/env bash
# INFRA-19: tries infra/oracle/scripts/sportconnect-setup.sh with a STAND-IN `docker` (and `curl`) command, so the logic runs
# anywhere bash runs, with no registry and no Compose: the plan, the staging, the refusals before a change, the in-place
# Caddyfile write, the order of the steps and the restore after each kind of failure.
#
#   infra/scripts/test-sportconnect-setup.sh
#
# What this proves: the decisions and the file handling. What it cannot prove: that the real image, `caddy validate`,
# `caddy reload` and `docker compose up -d` behave as the stand-in does; those are the run on the box (INFRA-19, not run yet).
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
SETUP="${SETUP_UNDER_TEST:-$here/../oracle/scripts/sportconnect-setup.sh}"
ROOT="$(mktemp -d)"
trap 'rm -rf "$ROOT"' EXIT
pass=0; fail=0
ok()   { pass=$((pass + 1)); printf '  ok    %s\n' "$1"; }
bad()  { fail=$((fail + 1)); printf '  FAIL  %s\n' "$1"; }
check() { if eval "$2"; then ok "$1"; else bad "$1  [$2]"; fi; }

# ---- the stand-ins -------------------------------------------------------------------------------------------------------
mkdir -p "$ROOT/bin"
cat > "$ROOT/bin/docker" <<'EOF'
#!/usr/bin/env bash
# stand-in docker: behaviour comes from FAKE_* variables; every call is appended to $FAKE_CALLS
echo "docker $*" >> "$FAKE_CALLS"
case "$1" in
  info) exit 0 ;;
  buildx)
    [ -n "${FAKE_DIGEST:-}" ] || exit 1
    case "$*" in
      *Manifest.Digest*) echo "$FAKE_DIGEST" ;;
      *) printf '{"config": {"Labels": {"org.opencontainers.image.version": "%s", "org.opencontainers.image.revision": "abc"}}}\n' "$FAKE_VERSION" ;;
    esac ;;
  pull) exit "${FAKE_PULL_RC:-0}" ;;
  inspect) [ "${FAKE_CADDY_RUNNING:-1}" = 1 ] && { echo true; exit 0; } || exit 1 ;;
  exec)
    # caddy reload: refused while the live Caddyfile holds the marker RELOAD_FAIL
    grep -q RELOAD_FAIL "$WEB_DIR/Caddyfile" && exit 1; exit 0 ;;
  compose)
    case "$*" in
      *" config "*) exit "${FAKE_CONFIG_RC:-0}" ;;
      *" up "*) grep -q UP_FAIL "$WEB_DIR/kc-prod.override.yml" && exit 1; exit 0 ;;
    esac ;;
  run)
    case "$*" in
      *"caddy validate"*)
        f="$(printf '%s\n' "$@" | grep ':/etc/caddy/Caddyfile' | sed 's/:\/etc\/caddy\/Caddyfile.*//')"
        if grep -q INVALID "$f"; then echo "Error: adapting config: bad directive"; exit 1; fi
        echo "Valid configuration"; exit 0 ;;
      *)
        stage="$(printf '%s\n' "$@" | grep ':/out$' | sed 's/:\/out$//')"
        cp -a "$FAKE_FIXTURE/." "$stage/" ;;
    esac ;;
esac
EOF
cat > "$ROOT/bin/curl" <<'EOF'
#!/usr/bin/env bash
exit "${FAKE_CURL_RC:-0}"
EOF
# flock is not in Git Bash on Windows; the lock itself is not what these tests are about
printf '#!/usr/bin/env bash
exit 0
' > "$ROOT/bin/flock"
chmod +x "$ROOT/bin/docker" "$ROOT/bin/curl" "$ROOT/bin/flock"

# make_fixture <dir> <label>: a box image's content; the label ends up in the files so a change is visible
make_fixture() {
  local d="$1" l="$2"
  rm -rf "$d"; mkdir -p "$d/web" "$d/bin" "$d/sportconnect/infra/oracle/scripts" "$d/sportconnect/infra/keycloak/realm" \
    "$d/sportconnect/infra/keycloak/providers" "$d/sportconnect/infra/rabbitmq"
  printf 'caddy %s\n' "$l" > "$d/web/Caddyfile"
  printf 'override %s\n' "$l" > "$d/web/kc-prod.override.yml"
  printf '#!/bin/sh\necho deploy %s\n' "$l" > "$d/bin/sportconnect-deploy"
  printf 'compose %s\n' "$l" > "$d/sportconnect/infra/docker-compose.dev.yml"
  printf '#!/bin/sh\necho fetch %s\n' "$l" > "$d/sportconnect/infra/oracle/scripts/fetch-secrets.sh"
  printf '#!/bin/sh\necho setup %s\n' "$l" > "$d/sportconnect/infra/oracle/scripts/sportconnect-setup.sh"
  printf '{"realm":"%s"}\n' "$l" > "$d/sportconnect/infra/keycloak/realm/sportconnect-realm.json"
  printf 'jar-ext %s\n' "$l" > "$d/sportconnect/infra/keycloak/providers/sportconnect-keycloak-extensions.jar"
  printf 'jar-theme %s\n' "$l" > "$d/sportconnect/infra/keycloak/providers/sportconnect-keycloak-theme.jar"
  printf 'plugins\n' > "$d/sportconnect/infra/rabbitmq/enabled_plugins"
  chmod +x "$d/bin/sportconnect-deploy" "$d/sportconnect/infra/oracle/scripts/"*.sh
}

# new_box: a fresh test box under $T (home, web, binary folder), with a stack.env and a secret that must survive
new_box() {
  T="$(mktemp -d "$ROOT/t.XXXXXX")"
  export SC_DIR="$T/sportconnect" WEB_DIR="$T/web" BIN_DIR="$T/usrbin" SUDO="" ENV_DIR="$T/web"
  export STACK_ENV="$T/web/stack.env" CADDY_PROBE_URL="" PATH="$ROOT/bin:$ORIG_PATH"
  export FAKE_CALLS="$T/calls" FAKE_FIXTURE="$T/fixture"
  mkdir -p "$SC_DIR" "$WEB_DIR" "$BIN_DIR"
  : > "$FAKE_CALLS"
  printf 'POSTGRES_PASSWORD=keep-me\n' > "$STACK_ENV"
  printf 'SECRET=keep-me-too\n' > "$WEB_DIR/server.env"
  printf 'kc-pw\n' > "$T/.kc-admin-pw"
  unset FAKE_PULL_RC FAKE_CONFIG_RC FAKE_CURL_RC; export FAKE_CADDY_RUNNING=1
}
ORIG_PATH="$PATH"
# set_prod <version> <digest>: what the registry says `prod` is
set_prod() { export FAKE_VERSION="$1" FAKE_DIGEST="$2"; }
run_setup() { OUT="$(bash "$SETUP" "$@" 2>&1 </dev/null)"; RC=$?; }
tree_hash() { (cd "$1" && find . -type f -not -path '*/.setup*' -not -path '*/fixture/*' -not -name setup.log -not -name calls -print0 | sort -z | xargs -0 sha256sum 2>/dev/null | sha256sum | cut -d' ' -f1); }
state() { cat "$WEB_DIR/.setup-state" 2>/dev/null || echo none; }
calls() { grep -c "$1" "$FAKE_CALLS" || true; }

D1=sha256:1111111111111111111111111111111111111111111111111111111111111111
D2=sha256:2222222222222222222222222222222222222222222222222222222222222222

echo "1. a fresh box: everything is installed, secrets are untouched"
new_box; make_fixture "$FAKE_FIXTURE" v1; set_prod 0.1.0 $D1
run_setup --yes
check "exit 0" '[ $RC -eq 0 ]'
check "state names the new image" '[ "$(state)" = "$D1|0.1.0" ]'
check "compose file in place" '[ "$(cat $SC_DIR/infra/docker-compose.dev.yml)" = "compose v1" ]'
check "both JARs in place" '[ -f $SC_DIR/infra/keycloak/providers/sportconnect-keycloak-theme.jar ] && [ -f $SC_DIR/infra/keycloak/providers/sportconnect-keycloak-extensions.jar ]'
check "Caddyfile and override in ~/web" '[ "$(cat $WEB_DIR/Caddyfile)" = "caddy v1" ] && [ "$(cat $WEB_DIR/kc-prod.override.yml)" = "override v1" ]'
check "sportconnect-deploy installed and executable" '[ -x $BIN_DIR/sportconnect-deploy ]'
check "fetch-secrets installed (last)" '[ "$(tail -1 $SC_DIR/infra/oracle/scripts/fetch-secrets.sh)" = "echo fetch v1" ]'
check "compose up -d ran once" '[ "$(calls " up -d")" = 1 ]'
check "no caddy reload on a new Caddyfile when caddy is running = one reload" '[ "$(calls "caddy reload")" = 1 ]'
check "stack.env, server.env and the dot-file untouched" '[ "$(cat $STACK_ENV)" = "POSTGRES_PASSWORD=keep-me" ] && [ "$(cat $WEB_DIR/server.env)" = "SECRET=keep-me-too" ] && [ "$(cat $T/.kc-admin-pw)" = kc-pw ]'
check "Keycloak note printed, not restarted" 'echo "$OUT" | grep -q "NOT restarted" && ! grep -q " restart " "$FAKE_CALLS"'
check "staging folder removed" '! ls -d $WEB_DIR/.setup-stage.* >/dev/null 2>&1'

echo "2. the same image again: nothing is pulled or changed"
: > "$FAKE_CALLS"; before="$(tree_hash $T)"
run_setup --yes
check "exit 0, says up to date" '[ $RC -eq 0 ] && echo "$OUT" | grep -q "up to date"'
check "no pull, no run, no reload" '[ "$(calls "docker pull")" = 0 ] && [ "$(calls "docker run")" = 0 ] && [ "$(calls "caddy reload")" = 0 ]'
check "tree unchanged" '[ "$(tree_hash $T)" = "$before" ]'

echo "3. a Caddyfile-only change: validated, written in place (same inode), reloaded, no compose up"
make_fixture "$FAKE_FIXTURE" v1; printf 'caddy v2\n' > "$FAKE_FIXTURE/web/Caddyfile"; set_prod 0.1.1 $D2
: > "$FAKE_CALLS"; ino="$(stat -c %i "$WEB_DIR/Caddyfile")"
run_setup --yes
check "exit 0" '[ $RC -eq 0 ]'
check "new Caddyfile content" '[ "$(cat $WEB_DIR/Caddyfile)" = "caddy v2" ]'
check "same inode (a bind mount keeps working)" '[ "$(stat -c %i "$WEB_DIR/Caddyfile")" = "$ino" ]'
check "validate ran, reload ran, compose up did not" '[ "$(calls "caddy validate")" = 1 ] && [ "$(calls "caddy reload")" = 1 ] && [ "$(calls " up -d")" = 0 ]'
check "the old Caddyfile is kept in .setup-prev" '[ "$(cat $WEB_DIR/.setup-prev/web/Caddyfile)" = "caddy v1" ]'

echo "4. an invalid Caddyfile: refused before anything changes"
new_box; make_fixture "$FAKE_FIXTURE" v1; set_prod 0.1.0 $D1; run_setup --yes
make_fixture "$FAKE_FIXTURE" v2; printf 'INVALID\n' > "$FAKE_FIXTURE/web/Caddyfile"; set_prod 0.1.1 $D2
before="$(tree_hash $T)"; : > "$FAKE_CALLS"
run_setup --yes
check "exit 1 and the reason names the Caddyfile" '[ $RC -eq 1 ] && echo "$OUT" | grep -q "does not validate"'
check "no file changed, state still v1" '[ "$(tree_hash $T)" = "$before" ] && [ "$(state)" = "$D1|0.1.0" ]'
check "no reload, no compose up" '[ "$(calls "caddy reload")" = 0 ] && [ "$(calls " up -d")" = 0 ]'

echo "5. the reload is refused: everything is put back"
new_box; make_fixture "$FAKE_FIXTURE" v1; set_prod 0.1.0 $D1; run_setup --yes
make_fixture "$FAKE_FIXTURE" v2; printf 'RELOAD_FAIL\n' > "$FAKE_FIXTURE/web/Caddyfile"; set_prod 0.1.1 $D2
before="$(tree_hash $T)"; : > "$FAKE_CALLS"
run_setup --yes
check "exit 1, report says FAILED at caddyfile" '[ $RC -eq 1 ] && echo "$OUT" | grep -q "SETUP FAILED at caddyfile"'
check "files, Caddyfile, override and deploy are the v1 ones again" '[ "$(tree_hash $T)" = "$before" ]'
check "state still v1" '[ "$(state)" = "$D1|0.1.0" ]'
check "caddy was reloaded again after the restore" '[ "$(calls "caddy reload")" = 2 ]'
check "fetch-secrets stayed the old copy" '[ "$(tail -1 $SC_DIR/infra/oracle/scripts/fetch-secrets.sh)" = "echo fetch v1" ]'

echo "6. compose up fails: the files come back and compose is brought up again from them"
new_box; make_fixture "$FAKE_FIXTURE" v1; set_prod 0.1.0 $D1; run_setup --yes
make_fixture "$FAKE_FIXTURE" v2; printf 'UP_FAIL\n' > "$FAKE_FIXTURE/web/kc-prod.override.yml"; set_prod 0.1.1 $D2
before="$(tree_hash $T)"; : > "$FAKE_CALLS"
run_setup --yes
check "exit 1, failed at compose" '[ $RC -eq 1 ] && echo "$OUT" | grep -q "SETUP FAILED at compose"'
check "tree back to v1, state v1" '[ "$(tree_hash $T)" = "$before" ] && [ "$(state)" = "$D1|0.1.0" ]'
check "compose up ran twice (the failed one, then from the restored files)" '[ "$(calls " up -d")" = 2 ]'

echo "7. the site does not answer after the install: restored"
new_box; make_fixture "$FAKE_FIXTURE" v1; set_prod 0.1.0 $D1; run_setup --yes
make_fixture "$FAKE_FIXTURE" v2; set_prod 0.1.1 $D2; before="$(tree_hash $T)"
export CADDY_PROBE_URL="https://example.test/" FAKE_CURL_RC=22
run_setup --yes
check "exit 1, failed at probe, tree back to v1" '[ $RC -eq 1 ] && echo "$OUT" | grep -q "SETUP FAILED at probe" && [ "$(tree_hash $T)" = "$before" ] && [ "$(state)" = "$D1|0.1.0" ]'

echo "7b. an empty CADDY_PROBE_URL skips the check (found on a real box 2026-11-05: ':-' replaced the empty value with the default)"
new_box; make_fixture "$FAKE_FIXTURE" v1; set_prod 0.1.0 $D1; run_setup --yes
make_fixture "$FAKE_FIXTURE" v2; set_prod 0.1.1 $D2
export CADDY_PROBE_URL="" FAKE_CURL_RC=22
run_setup --yes
check "installed although every curl would fail: the check was skipped" '[ $RC -eq 0 ] && [ "$(state)" = "$D2|0.1.1" ]'

echo "8. refusals before any change"
new_box; make_fixture "$FAKE_FIXTURE" v1; set_prod 0.1.0 $D1; run_setup --yes
before="$(tree_hash $T)"
make_fixture "$FAKE_FIXTURE" v2; mkdir -p "$FAKE_FIXTURE/sportconnect/infra/oracle"; printf 'X=1\n' > "$FAKE_FIXTURE/sportconnect/infra/oracle/server.env"; set_prod 0.1.1 $D2
run_setup --yes
check "a staged .env is refused" '[ $RC -eq 1 ] && echo "$OUT" | grep -q "looks like a secret" && [ "$(tree_hash $T)" = "$before" ]'
make_fixture "$FAKE_FIXTURE" v2; printf 'x\n' > "$FAKE_FIXTURE/sportconnect/infra/keycloak/providers/client_secret_1.apps.json"
run_setup --yes
check "a staged client_secret*.json is refused" '[ $RC -eq 1 ] && echo "$OUT" | grep -q "looks like a secret" && [ "$(tree_hash $T)" = "$before" ]'
make_fixture "$FAKE_FIXTURE" v2; rm "$FAKE_FIXTURE/sportconnect/infra/keycloak/providers/sportconnect-keycloak-theme.jar"
run_setup --yes
check "an incomplete image (no theme JAR) is refused" '[ $RC -eq 1 ] && echo "$OUT" | grep -q "incomplete image" && [ "$(tree_hash $T)" = "$before" ]'
make_fixture "$FAKE_FIXTURE" v2; set_prod 0.0.9 $D2
run_setup --yes
check "a LOWER version is refused" '[ $RC -eq 1 ] && echo "$OUT" | grep -q "LOWER" && [ "$(tree_hash $T)" = "$before" ]'
set_prod 0.1.1 $D2; export FAKE_PULL_RC=1
run_setup --yes
check "a failed pull changes nothing" '[ $RC -eq 1 ] && echo "$OUT" | grep -q "could not pull" && [ "$(tree_hash $T)" = "$before" ]'
unset FAKE_PULL_RC; export FAKE_CONFIG_RC=1
run_setup --yes
check "a Compose file that fails 'config' changes nothing" '[ $RC -eq 1 ] && echo "$OUT" | grep -q "docker compose config" && [ "$(tree_hash $T)" = "$before" ]'
unset FAKE_CONFIG_RC; rm "$STACK_ENV"; before="$(tree_hash $T)"
run_setup --yes
check "Compose files change but stack.env is missing: refused" '[ $RC -eq 1 ] && echo "$OUT" | grep -q "stack.env" && [ "$(tree_hash $T)" = "$before" ]'
printf 'POSTGRES_PASSWORD=keep-me\n' > "$STACK_ENV"
unset FAKE_DIGEST; run_setup --yes
check "no prod image: refused with the login hint" '[ $RC -eq 1 ] && echo "$OUT" | grep -q "no .:prod. image"'

echo "9. --plan installs nothing, and a 'no' answer installs nothing"
new_box; make_fixture "$FAKE_FIXTURE" v1; set_prod 0.1.0 $D1
before="$(tree_hash $T)"
run_setup --plan
check "plan: lists files, writes nothing, no state" '[ $RC -eq 0 ] && echo "$OUT" | grep -q "plan only" && [ "$(tree_hash $T)" = "$before" ] && [ "$(state)" = none ]'
OUT="$(echo n | bash "$SETUP" 2>&1)"; RC=$?
check "answer n: cancelled, nothing written" '[ $RC -eq 0 ] && echo "$OUT" | grep -q cancelled && [ "$(tree_hash $T)" = "$before" ]'

echo "10. docker stopped: a clear refusal"
new_box; make_fixture "$FAKE_FIXTURE" v1; set_prod 0.1.0 $D1
cat > "$ROOT/bin/docker-down" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF
mkdir -p "$ROOT/down"; cp "$ROOT/bin/docker-down" "$ROOT/down/docker"; cp "$ROOT/bin/flock" "$ROOT/down/flock"; chmod +x "$ROOT/down/docker" "$ROOT/down/flock"
PATH="$ROOT/down:$ORIG_PATH" run_setup --yes
check "cannot talk to Docker" '[ $RC -eq 1 ] && echo "$OUT" | grep -q "cannot talk to Docker"'

echo
echo "sportconnect-setup tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
