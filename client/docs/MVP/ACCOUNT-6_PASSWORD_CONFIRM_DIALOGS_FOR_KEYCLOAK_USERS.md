# ACCOUNT-6 · Change-password and deactivate confirmations for Keycloak users

**Status:** `TODO` · **Type:** Bug follow-up (placeholder, scope decided by backend U24) · **Depends on:** backend **U24** (decision needed)

**Filed:** 2026-10-14, found in the AUTH-14 pickup census.

## What

`ChangePasswordDialog` (ACCOUNT-3, `PUT /users/me/password`) and the deactivate confirmation (ACCOUNT-4, `POST /users/me/deactivate`) both ask for the **current password**. A user provisioned from Keycloak has no local `password_hash`, so both always answer `CURRENT_PASSWORD_INCORRECT` for them (backend A26 finding, tracked as U24). Adapt both screens to whatever U24 decides (step-up through Keycloak's `auth_time`, a typed confirmation word, or the old check kept for legacy users), with en/vi copy, MSW handlers and e2e (`account-change-password`, `account-deactivate`).

## Out of scope

The backend decision itself (U24).

## Done when

A Keycloak user can change their password (or be pointed to Keycloak for it) and deactivate their account from Account Settings; the I18N-4 census rows for both are updated.
