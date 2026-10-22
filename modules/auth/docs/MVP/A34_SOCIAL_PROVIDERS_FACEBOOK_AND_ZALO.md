# A34 · Social providers: Facebook and Zalo

**Status:** `TODO` (postponed by the owner) · **Type:** Feature · **Depends on:** A29 (Google, sets the pattern), the owner's Facebook and Zalo apps · **Gates:** the Facebook and Zalo buttons working for real in the client theme (AUTH-15 already renders them)

**Filed:** 2026-10-18, split from A29 at the owner's request: the Facebook and Zalo app permissions are hard to get, so Google ships first.

## What

- Facebook as a built-in identity provider; **Zalo as a generic OIDC/OAuth provider** (or, if Zalo's non-standard token and profile endpoints do not fit, a small identity-provider extension in `infra/keycloak-extensions`). First check Zalo's real claims and whether it returns a phone or an email (A23 only used a stand-in).
- Same linking policy as A29: auto-link only on a provider-verified email, never by phone. Facebook may return no verified email; Zalo usually none: the no-email path ends on the profile page when neither identifier exists (A27 validator or A26 fallback; see A22).
- A social login of a deactivated account reactivates it (the A26 rule), covered for each provider.
- Realm settings through the admin API script and the realm file, no secrets in the repo; document how the owner creates each app and which redirect URIs to register.

## Out of scope

Unlinking a provider, contact import, the mobile app, Apple and GitHub, the buttons themselves (theme, AUTH-15).

## Done when

A real login with each provider works locally and is recorded here (a provider without an app is marked **not verified**).
