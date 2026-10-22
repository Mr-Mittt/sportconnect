#!/usr/bin/env bash
# A36: add the Google picture attribute, its provider mapper and its token mapper to a RUNNING Keycloak through the
# admin API (idempotent). The same definitions are mirrored into infra/keycloak/realm/sportconnect-realm.json by
# `node infra/scripts/realm-google-picture.mjs file`, so a re-deployed realm already has them (the realm-change rule
# in CLAUDE.md). Run apply-realm-google-provider.sh first: the provider mapper needs the `google` provider to exist.
#
#   infra/scripts/apply-realm-google-picture.sh
#
# Overrides: KEYCLOAK_URL (default http://localhost:8081), KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD (default
# admin/admin, the dev-only bootstrap account), KEYCLOAK_REALM (default sportconnect). Needs Node 18+.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "apply-realm-google-picture: 'node' is not on PATH" >&2
  exit 1
fi

node "$here/realm-google-picture.mjs" api
