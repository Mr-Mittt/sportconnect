#!/usr/bin/env bash
# AUTH-15: build the Keycloakify login theme (client/keycloak-theme) into a Keycloak provider JAR
# and install it where Keycloak loads providers from.
#
#   infra/scripts/build-keycloak-theme.sh [target-dir]
#
# target-dir defaults to infra/keycloak/providers (mounted read-only into the dev Compose Keycloak at
# /opt/keycloak/providers; *.jar there is git-ignored). Restart Keycloak afterwards:
#   docker compose -f infra/docker-compose.dev.yml restart keycloak
#
# Needs Node + pnpm, a JDK and Apache Maven on PATH (keycloakify build calls Maven; it does not
# download one). INFRA-13 documents the same requirement.
#
# The old JAR is deleted first on purpose: on Windows the last step of `keycloakify build` renames
# the new JAR into place and fails with EPERM when one already exists, and that failure is easy to
# miss because the earlier steps print success (A24 finding 4). A CI runner never sees it.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
theme_dir="$here/../../client/keycloak-theme"
target_dir="${1:-$here/../keycloak/providers}"

# A launcher with a trimmed PATH (an IDE run configuration, a bare `bash`) may not see tools that
# work in a normal terminal. Append the usual Windows locations so the script runs from anywhere;
# a tool already on PATH always wins, these are only fallbacks.
add_dir() { [ -d "$1" ] && PATH="$PATH:$1"; return 0; }
if command -v cygpath >/dev/null 2>&1; then
  add_dir "$(cygpath -u 'C:\Program Files\nodejs')"
  [ -n "${APPDATA:-}" ] && add_dir "$(cygpath -u "$APPDATA")/npm"
  [ -n "${MAVEN_HOME:-}" ] && add_dir "$(cygpath -u "$MAVEN_HOME")/bin"
  [ -n "${JAVA_HOME:-}" ] && add_dir "$(cygpath -u "$JAVA_HOME")/bin"
  add_dir "$(cygpath -u 'C:\Program Files\Common Files\Oracle\Java\javapath')"
  [ -n "${M2_HOME:-}" ] && add_dir "$(cygpath -u "$M2_HOME")/bin"
  for ide in "/c/Program Files/JetBrains"/*/plugins/maven/lib/maven3/bin; do add_dir "$ide"; done
fi

for tool in node pnpm java mvn; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "build-keycloak-theme: '$tool' is not on PATH (needs Node, pnpm, a JDK and Apache Maven)" >&2
    exit 1
  fi
done

cd "$theme_dir"
pnpm install --frozen-lockfile
rm -f dist_keycloak/*.jar
pnpm run build-keycloak-theme

# Keycloak 26 reads the "all-other-versions" build (the other JAR targets Keycloak 22-24).
jar="$(ls dist_keycloak/keycloak-theme-for-kc-all-other-versions.jar 2>/dev/null || true)"
if [ -z "$jar" ]; then
  echo "build-keycloak-theme: keycloakify build produced no keycloak-theme-for-kc-all-other-versions.jar" >&2
  ls -l dist_keycloak >&2 || true
  exit 1
fi

mkdir -p "$target_dir"
rm -f "$target_dir/sportconnect-keycloak-theme.jar"
cp "$jar" "$target_dir/sportconnect-keycloak-theme.jar"
echo "installed $(cd "$target_dir" && pwd)/sportconnect-keycloak-theme.jar ($(du -h "$jar" | cut -f1))"
