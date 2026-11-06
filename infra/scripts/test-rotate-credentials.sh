#!/usr/bin/env bash
# INFRA-14: tests for the credential rotation commands of infra/oracle/scripts/rotate-credentials.sh (smtp, keycloak-admin, google,
# ghcr, all), for set-google-provider.sh, for the google-oauth line of apply-realm-production.sh check, and for the optional
# google-oauth item of fetch-secrets.sh.
#
#   infra/scripts/test-rotate-credentials.sh
#
# Needs Docker, Node 18+, curl and the built Keycloak extensions JAR (infra/scripts/build-keycloak-extensions.sh; the committed realm
# names its providers). It starts, and removes at the end:
#   - a throwaway Keycloak 26.4 with the committed realm on :8091 (ROTATE_TEST_KC_PORT), admin password "old-admin-password-1";
#   - a throwaway Mailpit that demands SMTP login on :8092 (ROTATE_TEST_SMTP_PORT), user sc-user, password good-pass;
#   - a stand-in for Google's token endpoint and GitHub's /user on :8093 (ROTATE_TEST_STUB_PORT): the secret "good-secret" gets
#     `invalid_grant` (Google's answer to a right secret with a dummy code), any other secret gets `invalid_client`;
#   - for the ghcr cases only, a stand-in `docker` and `fetch-secrets.sh` (the real ones need GHCR and the Vault);
#   - one Linux container for fetch-secrets.sh (it refuses a folder that is not tmpfs), with a stand-in `sops` and `docker`.
# What it cannot prove: Google's real endpoint with the real secret, Brevo's real SMTP login, GitHub's real expiry header. Those are
# run by the owner on the box (guide section 18).
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$here/../.."
SC="$repo/infra/oracle/scripts"
ROT="$SC/rotate-credentials.sh"
KC_PORT="${ROTATE_TEST_KC_PORT:-8091}"
MP_PORT="${ROTATE_TEST_SMTP_PORT:-8092}"
STUB_PORT="${ROTATE_TEST_STUB_PORT:-8093}"
KC_NAME="sportconnect-rotate-test-keycloak"
MP_NAME="sportconnect-rotate-test-mailpit"
KC_IMAGE="quay.io/keycloak/keycloak:26.4"
MP_IMAGE="axllent/mailpit:v1.21"
export MSYS_NO_PATHCONV=1
native() { (cd "$1" && (pwd -W 2>/dev/null || pwd)); }

work="$(mktemp -d)"
stub_pid=""
cleanup() {
  docker rm -f "$KC_NAME" "$MP_NAME" >/dev/null 2>&1 || true
  [ -z "$stub_pid" ] || kill "$stub_pid" 2>/dev/null || true
  rm -rf "$work"
}
trap cleanup EXIT

pass=0; fail=0; OUT=""; RC=0
ok() { echo "ok    $1"; pass=$((pass+1)); }
no() { echo "FAIL  $1"; echo "      output: $(printf '%s' "$OUT" | tr '\n' ' ' | cut -c1-400)"; fail=$((fail+1)); }
run() { OUT="$("$@" 2>&1)"; RC=$?; }
rc0() { if [ "$RC" = 0 ]; then ok "$1"; else no "$1 (exit $RC, wanted 0)"; fi; }
rcbad() { if [ "$RC" != 0 ]; then ok "$1"; else no "$1 (exit 0, wanted non-zero)"; fi; }
has() { case "$OUT" in *"$1"*) ok "$2" ;; *) no "$2 (missing: $1)" ;; esac; }
hasnt() { case "$OUT" in *"$1"*) no "$2 (found: $1)" ;; *) ok "$2" ;; esac; }
is() { if [ "$1" = "$2" ]; then ok "$3"; else no "$3 (got '$1', wanted '$2')"; fi; }

for t in docker node curl; do command -v "$t" >/dev/null || { echo "test-rotate-credentials: $t is not on PATH" >&2; exit 2; }; done
docker info >/dev/null 2>&1 || { echo "test-rotate-credentials: the Docker daemon is not running" >&2; exit 2; }
EXT_JAR="${EXTENSION_JAR:-$repo/infra/keycloak/providers/sportconnect-keycloak-extensions.jar}"
[ -f "$EXT_JAR" ] || { echo "test-rotate-credentials: $EXT_JAR not found (infra/scripts/build-keycloak-extensions.sh)" >&2; exit 2; }

# ---- the environment the scripts under test see ----
mkdir -p "$work/env" "$work/providers" "$work/mp"
cp "$EXT_JAR" "$work/providers/sportconnect-keycloak-extensions.jar"
[ ! -f "$repo/infra/keycloak/providers/sportconnect-keycloak-theme.jar" ] || cp "$repo/infra/keycloak/providers/sportconnect-keycloak-theme.jar" "$work/providers/"
chmod 755 "$work" "$work/providers" "$work/mp"; chmod 644 "$work/providers/"*.jar
printf 'sc-user:good-pass\n' > "$work/mp/auth"; chmod 644 "$work/mp/auth"

cat > "$work/stub.mjs" <<'JS'
import http from "node:http";
const port = Number(process.argv[2]);
http.createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    const send = (code, obj, headers = {}) => { res.writeHead(code, { "content-type": "application/json", ...headers }); res.end(req.method === "HEAD" ? "" : JSON.stringify(obj)); };
    if (req.url === "/token") {
      const p = new URLSearchParams(body);
      if (p.get("client_secret") === "good-secret") return send(400, { error: "invalid_grant", error_description: "Malformed auth code." });
      return send(401, { error: "invalid_client", error_description: "Unauthorized" });
    }
    if (req.url === "/other") return send(400, { error: "invalid_request" });
    if (req.url === "/user") {
      const a = req.headers.authorization || "";
      if (a === "Bearer good-token") return send(200, {}, { "github-authentication-token-expiration": "2027-01-31 10:00:00 UTC", "x-oauth-scopes": "read:packages" });
      if (a === "Bearer no-expiry-token") return send(200, {}, { "x-oauth-scopes": "read:packages" });
      return send(401, {});
    }
    send(404, {});
  });
}).listen(port, "127.0.0.1");
JS
node "$(native "$work")/stub.mjs" "$STUB_PORT" & stub_pid=$!
for _ in $(seq 1 20); do curl -s -o /dev/null "http://127.0.0.1:$STUB_PORT/" && break; sleep 0.5; done

docker rm -f "$KC_NAME" "$MP_NAME" >/dev/null 2>&1 || true
docker run -d --name "$MP_NAME" -p "127.0.0.1:$MP_PORT:1025" -e MP_SMTP_AUTH_FILE=/mp/auth -e MP_SMTP_AUTH_ALLOW_INSECURE=true \
  -v "$(native "$work/mp"):/mp:ro" "$MP_IMAGE" >/dev/null || { echo "could not start Mailpit" >&2; exit 2; }
docker run -d --name "$KC_NAME" -p "127.0.0.1:$KC_PORT:8080" \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD=old-admin-password-1 -e KC_HOSTNAME="http://localhost:$KC_PORT" \
  -v "$(native "$repo/infra/keycloak/realm")/sportconnect-realm.json:/opt/keycloak/data/import/sportconnect-realm.json:ro" \
  -v "$(native "$work/providers"):/opt/keycloak/providers:ro" "$KC_IMAGE" start-dev --import-realm >/dev/null || { echo "could not start Keycloak" >&2; exit 2; }
echo "waiting for Keycloak on :$KC_PORT ..."
ready=0
for _ in $(seq 1 120); do curl -fsS "http://localhost:$KC_PORT/realms/sportconnect/.well-known/openid-configuration" >/dev/null 2>&1 && { ready=1; break; }; sleep 2; done
[ "$ready" = 1 ] || { echo "Keycloak did not come up:" >&2; docker logs --tail 30 "$KC_NAME" >&2; exit 2; }

ADMIN="old-admin-password-1"       # the admin password Keycloak has right now (updated by the keycloak-admin cases)
printf '%s\n' "$ADMIN" > "$work/env/kc-admin-pw"
cat > "$work/env/server.env" <<EOF
MAIL_HOST=127.0.0.1
MAIL_PORT=$MP_PORT
MAIL_USERNAME=sc-user
MAIL_PASSWORD=good-pass
EMAIL_FROM=noreply@example.test
KEYCLOAK_CREDENTIALS_CLIENT_SECRET=a-test-credentials-secret
EOF

# rot <args>: rotate-credentials.sh against the throwaway containers
rot() {
  ENV_DIR="$work/env" KC_CONTAINER="$KC_NAME" SCRIPTS="$SC" STACK_ENV="$work/no-such-stack.env" AUTH_URL="https://auth.example.test" \
    SMTP_CHECK_PLAIN=1 bash "$ROT" "$@"
}
# kcq <admin password> <kcadm command with $K>: runs it inside the Keycloak container after a login
kcq() {
  local pw="$1"; shift
  printf '%s\n' "$pw" | docker exec -i "$KC_NAME" sh -c 'read -r P; K=/opt/keycloak/bin/kcadm.sh
    $K config credentials --server http://localhost:8080 --realm master --user admin --password "$P" >/dev/null 2>&1 && { '"$*"'; }
    rc=$?; rm -f ~/.keycloak/kcadm.config; exit $rc'
}
flat() { tr -d '\n\r ' ; }
gprov() { kcq "$ADMIN" '$K get identity-provider/instances/google -r sportconnect' 2>/dev/null | flat; }
realm_smtp() { kcq "$ADMIN" '$K get realms/sportconnect --fields "smtpServer(host,port,user,from)"' 2>/dev/null | flat; }

rc_is_2() { if [ "$RC" = 2 ]; then ok "$1"; else no "$1 (exit $RC)"; fi; }
echo "== usage and the stack file"
run rot; rc_is_2 "no argument prints the usage and exits 2"
has "rotate-credentials.sh google" "the usage lists google"
run rot nonsense; rc_is_2 "an unknown subcommand exits 2"
run rot postgres;           rcbad "postgres still needs the stack env file"; has "not found" "postgres says the stack env file is missing"

echo "== set-google-provider.sh"
run bash -c "printf 'pw\n\n\n' | docker exec -i $KC_NAME sh -c \"\$(cat '$SC/set-google-provider.sh')\""
rcbad "empty client id and secret on stdin: refused"; has "nothing changed" "and it says nothing changed"

echo "== google"
kcq "$ADMIN" '$K update identity-provider/instances/google -r sportconnect -s enabled=true -s config.clientId=old-id.apps -s config.clientSecret=old-secret' >/dev/null 2>&1
before="$(gprov)"
case "$before" in *'"clientId":"old-id.apps"'*'"enabled":true'*|*'"enabled":true'*'"clientId":"old-id.apps"'*) ok "setup: the provider is enabled with the old client id" ;; *) OUT="$before"; no "setup: the provider is not as expected" ;; esac
flow_before="$(printf '%s' "$before" | sed -n 's/.*"firstBrokerLoginFlowAlias":"\([^"]*\)".*/\1/p')"

printf '%s' "new-id.apps:bad-secret" > "$work/env/google-oauth"
GOOGLE_TOKEN_URL="http://127.0.0.1:$STUB_PORT/token" run rot google
rcbad "a secret Google refuses aborts"; has "invalid_client" "and says invalid_client"
case "$(gprov)" in *'"clientId":"old-id.apps"'*) ok "and the realm still has the old client id" ;; *) no "the realm's client id changed after a refused secret" ;; esac

GOOGLE_TOKEN_URL="http://127.0.0.1:9/token" run rot google
rcbad "Google unreachable aborts"; has "no usable answer" "and says so"
case "$(gprov)" in *'"clientId":"old-id.apps"'*) ok "and the realm is unchanged" ;; *) no "the realm changed while Google was unreachable" ;; esac

GOOGLE_TOKEN_URL="http://127.0.0.1:$STUB_PORT/other" run rot google
rcbad "an unexpected Google error aborts"; has "invalid_request" "and names it"

printf '%s' "no-colon-here" > "$work/env/google-oauth"
GOOGLE_TOKEN_URL="http://127.0.0.1:$STUB_PORT/token" run rot google
rcbad "an item without a colon is refused"; has "must hold" "and the message says what it must hold"
printf '%s' "id-without-secret:" > "$work/env/google-oauth"
GOOGLE_TOKEN_URL="http://127.0.0.1:$STUB_PORT/token" run rot google
rcbad "an empty secret is refused"

printf '%s\n' "new-id.apps:good-secret" > "$work/env/google-oauth"   # a trailing newline is tolerated
GOOGLE_TOKEN_URL="http://127.0.0.1:$STUB_PORT/token" run rot google
rc0 "a secret Google accepts is applied"; has "Google accepts the client id and secret" "and the test is reported"
hasnt "good-secret" "and the secret is not printed"
after="$(gprov)"
case "$after" in *'"clientId":"new-id.apps"'*) ok "the realm has the new client id" ;; *) no "the realm still has the old client id" ;; esac
case "$after" in *'"enabled":true'*) ok "the provider is still enabled" ;; *) no "the provider's enabled flag changed" ;; esac
is "$(printf '%s' "$after" | sed -n 's/.*"firstBrokerLoginFlowAlias":"\([^"]*\)".*/\1/p')" "$flow_before" "the first-broker-login flow is untouched"
GOOGLE_TOKEN_URL="http://127.0.0.1:$STUB_PORT/token" run rot google
rc0 "running it again changes nothing and succeeds"

echo "== apply-realm-production.sh check, the Google line"
chk() { ENV_DIR="$work/env" KC_CONTAINER="$KC_NAME" PUBLIC_URL=https://example.test ADMIN_URL=http://localhost:18081 SCRIPTS="$SC" bash "$SC/apply-realm-production.sh" check; }
run chk; has "ok   google provider client id equals the one in the Vault item" "the client id of the Vault item matches the realm"
printf '%s' "other-id.apps:good-secret" > "$work/env/google-oauth"
run chk; has "FAIL google provider client id differs" "a different client id in the Vault item is reported"
mv "$work/env/google-oauth" "$work/google-oauth.keep"
run chk; has "no google-oauth item fetched" "without the item the line is info only"
mv "$work/google-oauth.keep" "$work/env/google-oauth"; printf '%s' "new-id.apps:good-secret" > "$work/env/google-oauth"

echo "== smtp"
smtp_before="$(realm_smtp)"
sed -i 's/^MAIL_PASSWORD=.*/MAIL_PASSWORD=wrong-pass/' "$work/env/server.env"
run rot smtp; rcbad "a refused SMTP login aborts"; has "FAIL" "and reports the refusal"; has "nothing was changed" "and says nothing was changed"
is "$(realm_smtp)" "$smtp_before" "the realm's mail settings are unchanged"
sed -i 's/^MAIL_PASSWORD=.*/MAIL_PASSWORD=good-pass/; s/^MAIL_USERNAME=.*/MAIL_USERNAME=other-user/' "$work/env/server.env"
run rot smtp; rcbad "a refused SMTP user aborts"
sed -i 's/^MAIL_USERNAME=.*/MAIL_USERNAME=sc-user/; s/^MAIL_PASSWORD=.*/MAIL_PASSWORD=/' "$work/env/server.env"
run rot smtp; rcbad "an empty MAIL_PASSWORD is refused"; has "MAIL_PASSWORD is empty" "and named"
sed -i 's/^MAIL_PASSWORD=.*/MAIL_PASSWORD=good-pass/' "$work/env/server.env"
run rot smtp; rc0 "a good SMTP login is applied"; has "accepts the login" "and reported"; hasnt "good-pass" "and the key is not printed"; has "recreate the server" "it reminds the owner to recreate the server"
s_after="$(realm_smtp)"
case "$s_after" in *'"host":"127.0.0.1"'*) ok "the realm's mail host is the new one" ;; *) OUT="$s_after"; no "the realm's mail host did not change" ;; esac
case "$s_after" in *'"user":"sc-user"'*) ok "the realm's mail user is the new one" ;; *) OUT="$s_after"; no "the realm's mail user did not change" ;; esac

echo "== google, provider missing (last: it deletes the provider)"
kcq "$ADMIN" '$K delete identity-provider/instances/google -r sportconnect' >/dev/null 2>&1
GOOGLE_TOKEN_URL="http://127.0.0.1:$STUB_PORT/token" run rot google
rcbad "no google provider in the realm: refused"; has "no google identity provider" "and says so"
case "$(gprov)" in "") ok "and no provider was created" ;; *) no "a provider appeared" ;; esac

echo "== keycloak-admin"
printf '%s\n' "$ADMIN" > "$work/env/kc-admin-pw"
run rot keycloak-admin </dev/null; rc0 "the password in the file already works: nothing to change"; has "nothing to change" "and it says so"
printf '%s\n' "new-admin-password-2" > "$work/env/kc-admin-pw"; printf '%s\n' "$ADMIN" > "$work/old-pw"
KC_OLD_ADMIN_PW_FILE="$work/old-pw" run rot keycloak-admin; rc0 "a new password is set with the old one"; has "verified by logging in" "and verified"
hasnt "new-admin-password-2" "and not printed"
kcq "new-admin-password-2" 'true' >/dev/null 2>&1 && ok "the new password logs in" || no "the new password does not log in"
kcq "$ADMIN" 'true' >/dev/null 2>&1 && no "the old password still logs in" || ok "the old password is refused"
ADMIN="new-admin-password-2"
printf '%s\n' "new-admin-password-3" > "$work/env/kc-admin-pw"; printf '%s\n' "wrong-old-password" > "$work/old-pw"
KC_OLD_ADMIN_PW_FILE="$work/old-pw" run rot keycloak-admin; rcbad "a wrong old password aborts"; has "nothing was changed" "and says nothing was changed"
kcq "$ADMIN" 'true' >/dev/null 2>&1 && ok "the current password still works" || no "the current password stopped working"
kcq "$ADMIN" '$K update realms/master -s "passwordPolicy=length(40)"' >/dev/null 2>&1
printf '%s\n' "new-admin-password-4" > "$work/env/kc-admin-pw"; printf '%s\n' "$ADMIN" > "$work/old-pw"
KC_OLD_ADMIN_PW_FILE="$work/old-pw" run rot keycloak-admin; rcbad "a refused password change exits non-zero"; has "password change failed" "and says so"
kcq "$ADMIN" 'true' >/dev/null 2>&1 && ok "the current password still works after the refusal" || no "the current password stopped working"
kcq "$ADMIN" '$K update realms/master -s passwordPolicy=' >/dev/null 2>&1
printf '%s\n' "short" > "$work/env/kc-admin-pw"
run rot keycloak-admin </dev/null; rcbad "a password shorter than 12 characters is refused"
printf '%s\n' "new-admin-password-5" > "$work/env/kc-admin-pw"
run rot keycloak-admin </dev/null; rcbad "with no old-password file and no terminal it stops"; has "terminal" "and says why"

echo "== ghcr (stand-in docker and fetch-secrets.sh)"
mkdir -p "$work/stubbin" "$work/ghcrscripts" "$work/dockercfg"
cat > "$work/stubbin/docker" <<'SH'
#!/bin/sh
case "$*" in
  *"imagetools inspect"*) [ -z "${STUB_DOCKER_FAIL:-}" ] || { echo "unauthorized: authentication required" >&2; exit 1; }; echo "sha256:0123456789abcdef0123456789abcdef0123456789abcdef" ;;
  *) exit 0 ;;
esac
SH
cat > "$work/ghcrscripts/fetch-secrets.sh" <<'SH'
#!/bin/sh
case "${STUB_FETCH:-ok}" in
  ok) echo "fetch-secrets: docker login ghcr.io ok" >&2 ;;
  skipped) echo "fetch-secrets: GHCR login skipped or failed (item x)" >&2 ;;
  fail) echo "fetch-secrets: item could not be read" >&2; exit 1 ;;
esac
echo "export ENV_DIR=/nowhere"
SH
chmod +x "$work/stubbin/docker" "$work/ghcrscripts/fetch-secrets.sh"
cfg() { printf '{\n  "auths": {\n    "ghcr.io": {\n      "auth": "%s"\n    }\n  }\n}\n' "$(printf '%s' "$1" | base64 | tr -d '\n')" > "$work/dockercfg/config.json"; }
ghcr() { PATH="$work/stubbin:$PATH" SCRIPTS="$work/ghcrscripts" DOCKER_CONFIG="$work/dockercfg" GITHUB_API_URL="http://127.0.0.1:$STUB_PORT" bash "$ROT" ghcr; }
cfg "someone:good-token"
run ghcr; rc0 "a good token: login, image read, expiry"; has "docker login ghcr.io" "the login is reported"; has "can be read" "the image read is reported"
has "token expiry: 2027-01-31 10:00:00 UTC" "the expiry date is printed"; has "token scopes: read:packages" "the scopes are printed"; hasnt "good-token" "the token is not printed"
cfg "someone:no-expiry-token"; run ghcr; rc0 "a token without an expiry header still succeeds"; has "token expiry: " "the expiry line is there"; has "header was not sent" "and the note says to read it on GitHub"
cfg "someone:good-token"; STUB_FETCH=skipped run ghcr; rcbad "a skipped login aborts"; has "did not happen" "and says so"
STUB_FETCH=fail run ghcr; rcbad "a failing fetch aborts"
STUB_DOCKER_FAIL=1 run ghcr; rcbad "an unreadable image aborts"; has "cannot be read" "and says so"
rm -f "$work/dockercfg/config.json"; run ghcr; rc0 "no credential in the docker config: succeeds"; has "cannot be read from" "and says the expiry is not printed"

echo "== all (a stand-in for each step)"
cat > "$work/self.sh" <<'SH'
#!/bin/sh
echo "$1" >> "$ROTATE_TEST_LOG"
[ "$1" != "${FAIL_AT:-}" ]
SH
chmod +x "$work/self.sh"
: > "$work/log"; ROTATE_TEST_LOG="$work/log" ROTATE_SELF="$work/self.sh" run rot all
rc0 "all runs"; is "$(tr '\n' ' ' < "$work/log")" "postgres rabbitmq smtp keycloak-admin " "in the order postgres, rabbitmq, smtp, keycloak-admin"
has "rotate-credentials.sh google" "and reminds about google and ghcr"
: > "$work/log"; FAIL_AT=smtp ROTATE_TEST_LOG="$work/log" ROTATE_SELF="$work/self.sh" run rot all
rcbad "all stops at a failing step"; is "$(tr '\n' ' ' < "$work/log")" "postgres rabbitmq smtp " "and ran nothing after it"; has "were not run" "and says so"

echo "== fetch-secrets.sh: the optional google-oauth item (Linux container)"
img=""
for c in "${ROTATE_TEST_LINUX_IMAGE:-}" ghcr.io/mr-mittt/sportconnect-postgis:16-3.6 postgis/postgis:16-3.6 debian:12-slim ubuntu:24.04; do
  [ -n "$c" ] && docker image inspect "$c" >/dev/null 2>&1 && { img="$c"; break; }
done
if [ -z "$img" ]; then echo "skip  no local Linux image with bash (set ROTATE_TEST_LINUX_IMAGE)"; else
  mkdir -p "$work/ft/secrets" "$work/ft/bin"
  cp "$SC/fetch-secrets.sh" "$work/ft/fetch-secrets.sh"
  printf '#!/bin/sh\nfor a; do f="$a"; done; cat "$f"\n' > "$work/ft/bin/sops"
  printf '#!/bin/sh\ncat >/dev/null\nexit 0\n' > "$work/ft/bin/docker"
  chmod +x "$work/ft/bin/sops" "$work/ft/bin/docker"
  for n in server-env chat-env stack-env kc-admin-pw; do printf 'X=1\n' > "$work/ft/secrets/$n.sops"; done
  cat > "$work/ft/run.sh" <<'SH'
#!/bin/bash
export PATH=/t/bin:$PATH SECRETS_BACKEND=sops SOPS_DIR=/t/secrets ENV_DIR=/dev/shm/ft HOME=/tmp/h
mkdir -p /tmp/h
f() { bash /t/fetch-secrets.sh >/tmp/out 2>/tmp/err; echo "rc=$?"; }
state() { if [ -f /dev/shm/ft/google-oauth ]; then echo "file=$(cat /dev/shm/ft/google-oauth) mode=$(stat -c %a /dev/shm/ft/google-oauth)"; else echo "file=absent"; fi; }
echo "F1 $(f) $(state) note=$(grep -c 'google-oauth absent' /tmp/err)"
printf 'my-id.apps:my-secret' > /t/secrets/google-oauth.sops
echo "F2 $(f) $(state)"
printf 'no-colon' > /t/secrets/google-oauth.sops
echo "F3 $(f) $(state)"
printf 'my-id.apps:my-secret' > /t/secrets/google-oauth.sops; f >/dev/null
rm /t/secrets/google-oauth.sops
echo "F4 $(f) $(state)"
SH
  chmod +x "$work/ft/run.sh"
  run docker run --rm -v "$(native "$work/ft"):/t" "$img" bash /t/run.sh
  has "F1 rc=0 file=absent" "no item: the fetch succeeds and writes no google-oauth"; has "note=1" "and prints a note"
  has "F2 rc=0 file=my-id.apps:my-secret mode=600" "an item: written, mode 600, no trailing newline"
  has "F3 rc=0 file=absent" "an item without a colon is not written"
  has "F4 rc=0 file=absent" "a stale file is removed when the item is gone"
fi

echo
echo "passed: $pass   failed: $fail"
[ "$fail" = 0 ]
