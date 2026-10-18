#!/usr/bin/env bash
# A35: apply the normalized-email rule to the sportconnect realm of a RUNNING Keycloak through the admin API
# (idempotent): the admin-only email_normalized attribute, the unique-email validator, the normalizer listener, the
# first-broker-login flow that finds an existing account by the normalized email, and a backfill of existing users.
# The provider JAR must already be loaded (infra/scripts/dev-keycloak-extensions.sh builds it and restarts Keycloak).
# Afterwards `node infra/scripts/realm-email-normalized.mjs file` copies the result into
# infra/keycloak/realm/sportconnect-realm.json (the realm-change rule in CLAUDE.md).
#
#   infra/scripts/apply-realm-email-normalized.sh
#
# Overrides: KEYCLOAK_URL (default http://localhost:8081), KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD (default
# admin/admin, the dev-only bootstrap account), KEYCLOAK_REALM (default sportconnect). Needs Node 18+.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "apply-realm-email-normalized: 'node' is not on PATH" >&2
  exit 1
fi

node "$here/realm-email-normalized.mjs" api
node "$here/realm-email-normalized.mjs" backfill
