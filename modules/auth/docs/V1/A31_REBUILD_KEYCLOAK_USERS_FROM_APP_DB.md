# A31 · Rebuild a Keycloak realm's users from the app database

**Status:** `TODO`
**Type:** Enhancement (Architecture)
**Depends on:** A28 (Keycloak sends the "set your password" email), A29 (the provider links exist to be saved); useful before INFRA-14 (production Keycloak)
**Filed:** 2026-10-15, owner request while working on AUTH-15: a realm reset (delete the realm, restart, re-import `sportconnect-realm.json`) loses every Keycloak user, because the realm file holds settings only. Deliberately not for MVP.

Today the app database is not enough to rebuild a realm: it has each user's id (= Keycloak `sub`), email, names, phone, language and `is_email_verified`, but no password (Keycloak owns it) and nothing about which social accounts are linked.

1. **Save the Keycloak-only data in the app DB.** A new auth-owned table of federated identity links (user id, provider, provider user id), written when a user signs in through a provider (or filled by a one-off backfill from the Keycloak admin API). No passwords, ever.
2. **Rebuild command.** An admin-run script or endpoint that re-creates every Keycloak user from `users` with the **same id** (Keycloak's partial-import endpoint keeps ids; a plain create does not), email, names, phone, language, email-verified and enabled, re-attaches the saved identity links, and gives each password user the required action "update password" (Keycloak's email, A28) so they set a new one by mail. Idempotent: a user that exists is skipped.
3. A user with no email (phone-only or Zalo-without-email) cannot receive that mail; the ticket decides their path (the phone/OTP answer from A27 or the owner, or a manual reset by an admin).

Entry point: an admin / ops action, run after a realm reset or when moving to a new Keycloak (INFRA-14). Output: a report of users created, skipped and needing manual handling.

**Account lifecycle:** deactivation lives in `users.is_active`, not in Keycloak `enabled`, so the rebuild creates every user enabled and the existing per-request gate still refuses a deactivated one. The endpoint (if one) is admin-only.

**Out of scope:** exporting password hashes (never); changing realm settings (they come from the realm file, kept in step with the live realm by the owner's rule in CLAUDE.md); Keycloak sessions and tokens (users sign in again); a notification feature.

**Tests:** an IT that rebuilds a realm (Testcontainers Keycloak, or the e2e container) and checks ids, links and the required action.
