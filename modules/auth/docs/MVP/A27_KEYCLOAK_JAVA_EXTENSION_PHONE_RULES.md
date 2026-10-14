# A27 · Keycloak Java extension: unique phone, email-or-phone, phone login (spike first)

**Status:** `TODO` · **Type:** Spike, then feature · **Depends on:** INFRA-13 · **Gates:** nothing in the code path (A26 has a backend fallback)

**Filed:** 2026-10-14, from the A23 findings (Keycloak enforces neither a unique custom attribute nor email-or-phone, and does not log in by phone).

**Delivery rule (owner, 2026-10-14): this work has its own branch, its own commit(s) and its own PR, separate from every other ticket.**

## What

1. **Half-day spike** against Keycloak 26.4 in INFRA-13's Compose: can the user-profile validator SPI enforce unique phone and email-or-phone, does a failing validator make first-broker-login show the "complete your profile" page, and can an authenticator resolve a phone number to a user? Record the answers here. If any cannot be done, stop and record the fallback.
2. On a go, a new Gradle module (`keycloak-extensions`) producing one provider JAR: the unique-phone validator, the email-or-phone validator, and the phone-login authenticator (E.164 normalisation). The database unique index and check (U23) stay as the backstop.
3. Document the upgrade cost: SPI APIs can change between Keycloak majors, so each upgrade needs a rebuild and a test.

## Fallback

The A26 callback enforces both rules at provisioning (`PHONE_ALREADY_USED`, `IDENTIFIER_REQUIRED`) and **phone login is dropped**; this ticket then closes with the findings only.

## Out of scope

The theme (AUTH-15), providers (A29).

## Done when

The spike is recorded; on a go the JAR loads in Compose and a test proves the three behaviours; CI builds the module.
