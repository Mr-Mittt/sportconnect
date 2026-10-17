#!/usr/bin/env bash
# A27: build the Keycloak phone-rules extension (infra/keycloak-extensions) into a provider JAR and install it where
# Keycloak loads providers from.
#
#   infra/scripts/build-keycloak-extensions.sh [target-dir]
#
# target-dir defaults to infra/keycloak/providers (mounted read-only into the dev Compose Keycloak; *.jar there is
# git-ignored). Then restart Keycloak and apply the realm side once (both idempotent):
#   docker compose -f infra/docker-compose.dev.yml restart keycloak
#   infra/scripts/apply-realm-phone-rules.sh
# A realm created from sportconnect-realm.json already has the realm side, but it needs this JAR loaded first or the
# import fails (the realm's flows, validators and listener name its providers). Needs a JDK 21 (Gradle wrapper).
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$here/../.."
target_dir="${1:-$here/../keycloak/providers}"

cd "$repo"
./gradlew -q :infra:keycloak-extensions:jar
mkdir -p "$target_dir"
cp infra/keycloak-extensions/build/libs/sportconnect-keycloak-extensions.jar "$target_dir/"
echo "build-keycloak-extensions: installed $target_dir/sportconnect-keycloak-extensions.jar"
