#!/usr/bin/env bash
# A33: add the "new Google account starts email-verified" mapper to the `google` provider of a RUNNING Keycloak through the
# admin API (idempotent). The same definition is mirrored into infra/keycloak/realm/sportconnect-realm.json by
# `node infra/scripts/realm-google-email-verified.mjs file`, so a re-deployed realm already has it (the realm-change rule
# in CLAUDE.md). Needs the extensions JAR loaded (build-keycloak-extensions.sh + a Keycloak restart) and the `google`
# provider (apply-realm-google-provider.sh).
#
#   infra/scripts/apply-realm-google-email-verified.sh
#
# Overrides: KEYCLOAK_URL (default http://localhost:8081), KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD (default
# admin/admin, the dev-only bootstrap account), KEYCLOAK_REALM (default sportconnect). Needs Node 18+.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "apply-realm-google-email-verified: 'node' is not on PATH" >&2
  exit 1
fi

node "$here/realm-google-email-verified.mjs" api
