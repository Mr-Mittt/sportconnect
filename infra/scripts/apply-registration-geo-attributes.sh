#!/usr/bin/env bash
# A32: add the register page's country / region / location attributes and their token mappers to a RUNNING
# Keycloak through the admin API (idempotent). The same definitions are mirrored into
# infra/keycloak/realm/sportconnect-realm.json by `node infra/scripts/registration-geo-attributes.mjs file`, so a
# re-deployed realm already has them (the realm-change rule in CLAUDE.md).
#
#   infra/scripts/apply-registration-geo-attributes.sh
#
# Overrides: KEYCLOAK_URL (default http://localhost:8081), KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD (default
# admin/admin, the dev-only bootstrap account), KEYCLOAK_REALM (default sportconnect). Needs Node 18+.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "apply-registration-geo-attributes: 'node' is not on PATH" >&2
  exit 1
fi

node "$here/registration-geo-attributes.mjs" api
