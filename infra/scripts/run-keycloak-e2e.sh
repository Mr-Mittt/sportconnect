#!/usr/bin/env bash
# AUTH-15: run the client's redirect e2e against a real, throwaway Keycloak that carries the
# SportConnect theme. The same script runs locally and in CI (client-ci.yml), so what passes here is
# what the workflow runs.
#
#   infra/scripts/run-keycloak-e2e.sh [--keep]
#
# Steps: build the theme JAR (unless THEME_JAR points at one) -> start quay.io/keycloak/keycloak:26.4
# with the committed realm import and the JAR -> wait until the realm answers -> `pnpm e2e:keycloak`
# (it creates its own user and placeholder Google/Facebook/Zalo providers through the admin API) ->
# remove the container, also on failure. `--keep` leaves it running for debugging.
#
# The container is separate from the dev Compose Keycloak (:8081): it uses host port
# ${KEYCLOAK_E2E_PORT:-8082}, its own embedded H2 store and no Postgres, so it never touches your dev
# realm or users. Needs Docker, plus what build-keycloak-theme.sh needs (Node, pnpm, JDK, Maven).
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$here/../.."
port="${KEYCLOAK_E2E_PORT:-8082}"
name="sportconnect-e2e-keycloak"
image="quay.io/keycloak/keycloak:26.4"
keep=0
[ "${1:-}" = "--keep" ] && keep=1

# Docker on Windows (Git Bash) wants native paths for bind mounts and must not rewrite /opt/...
native() { (cd "$1" && (pwd -W 2>/dev/null || pwd)); }
export MSYS_NO_PATHCONV=1

work="$(mktemp -d)"
cleanup() {
  if [ "$keep" -eq 0 ]; then
    docker rm -f "$name" >/dev/null 2>&1 || true
  else
    echo "run-keycloak-e2e: container '$name' left running on :$port (docker rm -f $name to remove)"
  fi
  rm -rf "$work"
}
trap cleanup EXIT

if [ -n "${THEME_JAR:-}" ]; then
  mkdir -p "$work/providers"
  cp "$THEME_JAR" "$work/providers/sportconnect-keycloak-theme.jar"
else
  bash "$here/build-keycloak-theme.sh" "$work/providers"
fi

# mktemp -d is mode 700 and Keycloak's container user is not ours: without this a Linux runner
# mounts a directory Keycloak cannot read, and the theme silently never loads.
chmod 755 "$work" "$work/providers"
chmod 644 "$work/providers/"*.jar

docker rm -f "$name" >/dev/null 2>&1 || true
docker run -d --name "$name" -p "$port:8080" \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin \
  -e KC_HOSTNAME="http://localhost:$port" \
  -v "$(native "$repo/infra/keycloak/realm")/sportconnect-realm.json:/opt/keycloak/data/import/sportconnect-realm.json:ro" \
  -v "$(native "$work/providers"):/opt/keycloak/providers:ro" \
  "$image" start-dev --import-realm >/dev/null

echo "run-keycloak-e2e: waiting for the realm on :$port ..."
ready=0
for _ in $(seq 1 90); do
  if curl -fsS "http://localhost:$port/realms/sportconnect/.well-known/openid-configuration" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done
if [ "$ready" -ne 1 ]; then
  echo "run-keycloak-e2e: Keycloak did not come up; last log lines:" >&2
  docker logs --tail 40 "$name" >&2 || true
  exit 1
fi

cd "$repo/client"
KEYCLOAK_URL="http://localhost:$port" pnpm e2e:keycloak
