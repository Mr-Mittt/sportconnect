#!/usr/bin/env bash
# INFRA-19: checks a built box config image (infra/box/Dockerfile) BEFORE it can be pushed. CI runs it on the image it just
# built (.github/workflows/box-image.yml); run it locally on any image you build:
#
#   docker build -f infra/box/Dockerfile -t sportconnect-box:local .
#   infra/scripts/verify-box-image.sh sportconnect-box:local
#
# It runs the image once to copy its files out (as sportconnect-setup does), then checks:
#   1. every file the box needs is there (the Compose file, the override, the Caddyfile, the realm, both JARs, the scripts)
#   2. NOTHING secret is in it: no *.env (an .example is fine), no client_secret*, none of the dot-secret files
#   3. both JARs are real archives; the scripts have LF endings and the executable bit
#   4. the Caddyfile passes `caddy validate`; the Compose file and the override pass `docker compose config`
#   5. the PostGIS image tag is the same in kc-prod.override.yml and in rotate-credentials.sh (PG_CLIENT_IMAGE), so a bump of
#      one cannot leave the other behind (the tag is pinned in two places; the image itself is its own workflow)
# Exit 1 on the first failed group, after printing every problem found in it. Needs docker; unzip or python3 for the JARs.
set -uo pipefail

image="${1:?usage: verify-box-image.sh <image>}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
# Git Bash on Windows: do not rewrite container paths (/box, /etc/caddy) and hand Docker a Windows form of the host folder.
export MSYS_NO_PATHCONV=1
hp() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }
fail=0
bad() { echo "verify-box-image: FAIL $*" >&2; fail=1; }
ok()  { echo "verify-box-image: ok   $*"; }

docker run --rm -e "OWNER_UID=$(id -u)" -e "OWNER_GID=$(id -g)" -v "$(hp "$work"):/out" "$image" >/dev/null \
  || { echo "verify-box-image: the image could not copy its files out" >&2; exit 1; }
cd "$work" || exit 1

# 1. required files
req=(web/Caddyfile web/kc-prod.override.yml bin/sportconnect-deploy
     sportconnect/infra/docker-compose.dev.yml sportconnect/infra/scripts/init-chat-db.sql sportconnect/infra/scripts/create-keycloak-db.sh
     sportconnect/infra/rabbitmq/enabled_plugins sportconnect/infra/keycloak/realm/sportconnect-realm.json
     sportconnect/infra/keycloak/providers/sportconnect-keycloak-extensions.jar sportconnect/infra/keycloak/providers/sportconnect-keycloak-theme.jar
     sportconnect/infra/oracle/scripts/fetch-secrets.sh sportconnect/infra/oracle/scripts/sportconnect-setup.sh
     sportconnect/infra/oracle/scripts/box-prepare.sh sportconnect/infra/oracle/scripts/start-stack.sh
     sportconnect/infra/oracle/scripts/rotate-credentials.sh sportconnect/infra/oracle/scripts/sportconnect-deploy.sh)
miss=0
for f in "${req[@]}"; do [ -s "$f" ] || { bad "missing or empty: $f"; miss=1; }; done
[ -d sportconnect/infra/keycloak/themes/sportconnect ] || { bad "missing: sportconnect/infra/keycloak/themes/sportconnect"; miss=1; }
[ $miss -eq 0 ] && ok "required files present"

# 2. no secrets
secrets="$(find . \( -name '*.env' -o -name 'client_secret*' -o -name '.kc-admin-pw' -o -name '.internal-secret' -o -name '.cred-secret' -o -name '.brevo-*' -o -name '*.pem' -o -name '*.key' \) -print)"
if [ -n "$secrets" ]; then bad "secret-looking files in the image: $(echo $secrets)"; else ok "no secret-looking file"; fi

# 3. JARs, line endings, executable bit
for j in sportconnect/infra/keycloak/providers/*.jar; do
  if command -v unzip >/dev/null 2>&1; then unzip -tq "$j" >/dev/null 2>&1 || bad "not a valid archive: $j"
  elif command -v python3 >/dev/null 2>&1; then python3 -c "import sys,zipfile; zipfile.ZipFile(sys.argv[1]).testzip()" "$j" 2>/dev/null || bad "not a valid archive: $j"
  fi
done
# read inside the image: the grep of Git Bash drops a CR from a pattern, and a Windows mount may translate line endings
crlf="$(docker run --rm --entrypoint sh "$image" -c 'find /box -type f \( -name "*.sh" -o -name "*.yml" -o -name "*.sql" -o -name "*.json" -o -name "*.example" -o -name "*.service" -o -name "*.timer" -o -name Caddyfile -o -name sportconnect-deploy -o -name enabled_plugins \) -exec grep -l "$(printf "\r")" {} +' || true)"
[ -z "$crlf" ] || bad "CRLF line endings in: $(echo $crlf)"
# the executable bit is read inside the image: a Windows bind mount does not keep it
noexec="$(docker run --rm --entrypoint sh "$image" -c 'for f in /box/bin/sportconnect-deploy /box/sportconnect/infra/oracle/scripts/*.sh /box/sportconnect/infra/scripts/*.sh; do [ -x "$f" ] || echo "$f"; done')"
[ -z "$noexec" ] || bad "not executable in the image: $(echo $noexec)"
[ $fail -eq 0 ] && ok "JARs valid, LF endings, scripts executable"

# 4. the Caddyfile and the Compose files parse
out="$(docker run --rm -v "$(hp "$work")/web/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile 2>&1)"
case "$out" in *"Valid configuration"*) ok "Caddyfile validates" ;; *) bad "Caddyfile: $(echo "$out" | tail -2 | tr '\n' ' ')" ;; esac
# the override refuses to start without its passwords (${VAR:?...}); give every one of them a dummy value
vars="$(grep -ho '\${[A-Z_][A-Z0-9_]*:?' web/kc-prod.override.yml sportconnect/infra/docker-compose.dev.yml | sed 's/^\${//; s/:?$//' | sort -u)"
for v in $vars; do echo "$v=x"; done > dummy.env
if docker compose --env-file dummy.env -f sportconnect/infra/docker-compose.dev.yml -f web/kc-prod.override.yml config -q >/dev/null 2>"$work/compose.err"; then
  ok "Compose files pass 'docker compose config'"
else
  bad "docker compose config: $(tail -3 "$work/compose.err" | tr '\n' ' ')"
fi

# 5. the PostGIS tag is pinned in two places
t1="$(grep -ho 'sportconnect-postgis:[0-9][0-9.-]*' web/kc-prod.override.yml | sort -u)"
t2="$(grep -ho 'sportconnect-postgis:[0-9][0-9.-]*' sportconnect/infra/oracle/scripts/rotate-credentials.sh | sort -u)"
if [ -z "$t1" ] || [ -z "$t2" ]; then bad "could not find the PostGIS tag (override: '$t1', rotate-credentials.sh: '$t2')"
elif [ "$t1" != "$t2" ]; then bad "the PostGIS tag differs: kc-prod.override.yml has $t1, rotate-credentials.sh has $t2"
else ok "PostGIS tag $t1 is the same in both files"; fi

[ $fail -eq 0 ] && echo "verify-box-image: all checks passed" || { echo "verify-box-image: FAILED" >&2; exit 1; }
