#!/usr/bin/env bash
# A29: put the single "prove it is your account" step (password or emailed link) into the first-broker-login flow of a RUNNING
# Keycloak through the admin API (idempotent). Needs the extensions JAR loaded and the A35 flow (apply-realm-email-normalized.sh).
set -euo pipefail
exec node "$(dirname "$0")/realm-link-existing-account.mjs" api
