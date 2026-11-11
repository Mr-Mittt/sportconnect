# A38 · First name is required on the Keycloak register page

**Status:** `TODO`
**Type:** Enhancement · **Depends on:** none (pairs with client ACCOUNT-8) ·
**Filed:** 2026-11-11, from SESSION-49: the client's default session title uses the signed-in
user's `firstName`, which is optional today. SESSION-49 accepts that as a known gap; this closes
it for new accounts.

Make `firstName` a required field on registration. It is Keycloak's page and realm, so the change
is realm and theme config, not Spring code: the realm user profile marks `firstName` required for
the register flow, and the Keycloakify theme (`client/keycloak-theme`) shows the field as required
with en and vi validation copy. Applied through a script under `infra/scripts/` and mirrored in
`infra/keycloak/realm/sportconnect-realm.json` (CLAUDE.md § Realm changes); production through
`infra/oracle/scripts/apply-realm-production.sh`.

To settle at pickup: existing accounts with an empty first name (a backfill, or leave them and let
ACCOUNT-8 prompt on next profile edit); social sign-in (Google), where first name comes from the
provider and may be missing; phone-only accounts; and whether the backend provisioning path
(`provisionExternalUser`) must reject or default an empty first name.

**Out of scope:** the account-settings form (client ACCOUNT-8); last name.

**Tests:** the realm-script live check (`infra/scripts/verify-*.mjs` pattern) and the redirect e2e
(`run-keycloak-e2e.sh`) for the register page.
