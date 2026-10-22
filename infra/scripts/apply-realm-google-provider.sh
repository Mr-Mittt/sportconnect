#!/usr/bin/env bash
# A29: create or update the Google identity provider in the sportconnect realm of a RUNNING Keycloak through the admin
# API (idempotent). The Google OAuth client comes from GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET or from the downloaded
# infra/keycloak/providers/client_secret_*.json (git-ignored); with neither it changes nothing. The A35 realm rules
# (apply-realm-email-normalized.sh) should already be applied: the provider uses that first-broker-login flow.
# The script prints the redirect URI to register at Google. Afterwards `node infra/scripts/realm-google-provider.mjs file`
# mirrors the (secret-free, disabled) provider into infra/keycloak/realm/sportconnect-realm.json.
#
#   infra/scripts/apply-realm-google-provider.sh
#
# Overrides: KEYCLOAK_URL (default http://localhost:8081), KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD (default
# admin/admin, the dev-only bootstrap account), KEYCLOAK_REALM (default sportconnect). Needs Node 18+.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "apply-realm-google-provider: 'node' is not on PATH" >&2
  exit 1
fi

node "$here/realm-google-provider.mjs" api
