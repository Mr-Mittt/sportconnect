#!/usr/bin/env bash
# AUTH-15: the whole local loop for the login theme in ONE command.
#
#   infra/scripts/dev-keycloak-theme.sh
#
# 1. build-keycloak-theme.sh  -> deletes the old JAR, builds a fresh one, installs it into
#                                infra/keycloak/providers/ (needs Node, pnpm, a JDK and Maven on PATH)
# 2. restarts the dev Compose Keycloak so it loads the JAR
# 3. waits until the realm answers
# 4. sets the realm's Login theme to `sportconnect` through the admin API (the realm import is
#    IGNORE_EXISTING, so the "loginTheme" line in the realm file only applies to a NEW realm)
#
# Run it from Git Bash on Windows. Compose Keycloak must already exist (docker compose up -d keycloak).
# Overrides: KEYCLOAK_URL (default http://localhost:8081), KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD
# (default admin/admin, the dev-only bootstrap account), SKIP_BUILD=1 to reuse the installed JAR.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$here/../.."
url="${KEYCLOAK_URL:-http://localhost:8081}"
admin_user="${KEYCLOAK_ADMIN:-admin}"
admin_password="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
realm="sportconnect"
theme="sportconnect"

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  bash "$here/build-keycloak-theme.sh"
fi

echo "dev-keycloak-theme: restarting Keycloak ..."
docker compose -f "$repo/infra/docker-compose.dev.yml" restart keycloak

echo "dev-keycloak-theme: waiting for the realm on $url ..."
ready=0
for _ in $(seq 1 90); do
  if curl -fsS "$url/realms/$realm/.well-known/openid-configuration" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
donew
if [ "$ready" -ne 1 ]; then
  echo "dev-keycloak-theme: Keycloak did not come back; last log lines:" >&2
  docker compose -f "$repo/infra/docker-compose.dev.yml" logs --tail 40 keycloak >&2 || true
  exit 1
fi

token="$(curl -fsS -X POST "$url/realms/master/protocol/openid-connect/token" \
  -d grant_type=password -d client_id=admin-cli \
  --data-urlencode "username=$admin_user" --data-urlencode "password=$admin_password" |
  node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).access_token))")"

# Read the realm, change only loginTheme, write it back (a PUT replaces the representation).
current="$(curl -fsS -H "Authorization: Bearer $token" "$url/admin/realms/$realm")"
updated="$(printf '%s' "$current" | THEME="$theme" node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);r.loginTheme=process.env.THEME;console.log(JSON.stringify(r))})")"
curl -fsS -X PUT -H "Authorization: Bearer $token" -H "Content-Type: application/json" \
  -d "$updated" "$url/admin/realms/$realm" >/dev/null

echo "dev-keycloak-theme: done. Realm '$realm' now uses the '$theme' login theme: $url/realms/$realm/account"
