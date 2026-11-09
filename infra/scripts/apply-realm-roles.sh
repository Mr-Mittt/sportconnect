#!/usr/bin/env bash
# A37: create the realm roles USER and ADMIN on a RUNNING Keycloak through the admin API, put USER in the realm default role, and give USER
# to every existing local user that lacks it (idempotent). The backend reads the roles from the access token (`realm_access.roles`), so a
# Keycloak that has not been through this gives every user a 403. The same definition is mirrored into
# infra/keycloak/realm/sportconnect-realm.json by `node infra/scripts/realm-roles.mjs file`, so a re-created realm already has it (the
# realm-change rule in CLAUDE.md). Production is different: the box runs infra/oracle/scripts/apply-realm-production.sh (INFRA-25).
#
#   infra/scripts/apply-realm-roles.sh
#
# ADMIN is created EMPTY. To try /admin locally, grant it to your own user in the console (http://localhost:8081, admin/admin) and refresh.
#
# Overrides: KEYCLOAK_URL (default http://localhost:8081), KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD (default admin/admin, the dev-only
# bootstrap account), KEYCLOAK_REALM (default sportconnect). Needs Node 18+. Live check: infra/scripts/verify-realm-roles.mjs.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "apply-realm-roles: 'node' is not on PATH" >&2
  exit 1
fi

node "$here/realm-roles.mjs" api
