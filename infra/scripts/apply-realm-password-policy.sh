#!/usr/bin/env bash
# Set the sportconnect realm's password policy (length(8)) on a RUNNING Keycloak through the admin API (idempotent).
# The same value is mirrored into infra/keycloak/realm/sportconnect-realm.json by
# `node infra/scripts/realm-password-policy.mjs file`, so a re-deployed realm already has it (the realm-change rule
# in CLAUDE.md).
#
#   infra/scripts/apply-realm-password-policy.sh
#
# Overrides: KEYCLOAK_URL (default http://localhost:8081), KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD (default
# admin/admin, the dev-only bootstrap account), KEYCLOAK_REALM (default sportconnect). Needs Node 18+.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "apply-realm-password-policy: 'node' is not on PATH" >&2
  exit 1
fi

node "$here/realm-password-policy.mjs" api
