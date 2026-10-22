#!/usr/bin/env bash
# A27: apply the phone rules to the sportconnect realm of a RUNNING Keycloak through the admin API (idempotent):
# the unique-phone and email-or-phone validators, the phone normaliser listener, and the browser flow that accepts a
# phone number. The provider JAR must already be loaded (`./gradlew :infra:keycloak-extensions:jar`, copy to
# infra/keycloak/providers, restart Keycloak). Afterwards `node infra/scripts/realm-phone-rules.mjs file` copies the
# result into infra/keycloak/realm/sportconnect-realm.json (the realm-change rule in CLAUDE.md).
#
#   infra/scripts/apply-realm-phone-rules.sh
#
# Overrides: KEYCLOAK_URL (default http://localhost:8081), KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD (default
# admin/admin, the dev-only bootstrap account), KEYCLOAK_REALM (default sportconnect). Needs Node 18+.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "apply-realm-phone-rules: 'node' is not on PATH" >&2
  exit 1
fi

node "$here/realm-phone-rules.mjs" api
