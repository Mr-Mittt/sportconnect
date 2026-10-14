# A29 · Social providers: Google, Facebook and Zalo

**Status:** `TODO` · **Type:** Feature · **Depends on:** A26, INFRA-13 (real provider credentials from the owner) · **Gates:** client AUTH-15 shows the buttons

**Filed:** 2026-10-14, from the social-login `/feature`.

## What

- Google and Facebook as built-in identity providers; **Zalo as a generic OIDC/OAuth provider**. First check Zalo's real claims and whether it returns a phone or an email (A23 only used a stand-in).
- Linking policy: auto-link only on a provider-verified email, **never by phone**; the Zalo no-email path ends on the profile page when neither identifier exists (A27's validator, or A26's fallback).
- Social login of a deactivated account reactivates it (the A26 rule), covered for each provider.
- Apple and GitHub are not configured.
- Realm settings land in the INFRA-13 import (no secrets in the repo); document how the owner creates each provider app and which redirect URIs to register.

## Out of scope

Unlinking a provider, contact import, the mobile app, the buttons themselves (the theme, AUTH-15).

## Done when

A real login with each provider works locally and is recorded here (or, for any provider the owner has no app for, marked **not verified** rather than assumed).
