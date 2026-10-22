#!/usr/bin/env bash
# A27: the whole local loop for the Keycloak phone-rules extension in ONE command.
#
#   infra/scripts/dev-keycloak-extensions.sh
#
# 1. build-keycloak-extensions.sh -> builds infra/keycloak-extensions and replaces the JAR in
#                                    infra/keycloak/providers/ (the directory mounted into the Compose Keycloak)
# 2. restarts the dev Compose Keycloak so it loads the JAR
# 3. waits until the realm answers
#
# The realm side (validators, listener, flows) lives in the realm, not the JAR, so it is not touched here; on a
# fresh or reset realm run infra/scripts/apply-realm-phone-rules.sh once.
# Run it from Git Bash on Windows. Compose Keycloak must already exist (docker compose up -d keycloak).
# Overrides: KEYCLOAK_URL (default http://localhost:8081), SKIP_BUILD=1 to just restart with the installed JAR.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$here/../.."
url="${KEYCLOAK_URL:-http://localhost:8081}"
realm="sportconnect"

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  bash "$here/build-keycloak-extensions.sh"
fi

echo "dev-keycloak-extensions: restarting Keycloak ..."
docker compose -f "$repo/infra/docker-compose.dev.yml" restart keycloak

echo "dev-keycloak-extensions: waiting for the realm on $url ..."
ready=0
for _ in $(seq 1 90); do
  if curl -fsS "$url/realms/$realm/.well-known/openid-configuration" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done
if [ "$ready" -ne 1 ]; then
  echo "dev-keycloak-extensions: Keycloak did not come back; last log lines:" >&2
  docker compose -f "$repo/infra/docker-compose.dev.yml" logs --tail 40 keycloak >&2 || true
  exit 1
fi

echo "dev-keycloak-extensions: done. Keycloak is back with the new extension JAR: $url/realms/$realm/account"
