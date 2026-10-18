# A29 · Social provider: Google (Facebook and Zalo moved to A34)

**Status:** `TODO` (A35 done 2026-10-18) · **Type:** Feature · **Depends on:** A35, A26, INFRA-13 (real provider credentials from the owner) · **Gates:** client AUTH-15 shows the buttons

**Filed:** 2026-10-14, from the social-login `/feature`.

**Scope change 2026-10-18 (owner decision):** this ticket now enables **Google only**. Facebook and Zalo moved to **A34** and are postponed, because getting their app permissions is hard (Facebook app review for email, Zalo app approval). The original wording below is kept for A34; read every Facebook / Zalo bullet as moved.

## What (Google only)

- Google as a built-in identity provider in the `sportconnect` realm, set through the admin API script and mirrored in `sportconnect-realm.json` without any secret.
- Linking policy: auto-link only on a provider-verified email (Google gives `email_verified`), never by phone. The existing-account lookup uses `email_normalized` (**A35**: `bao.nguyen.dangit@gmail.com` and `bao.nguyendangit@gmail.com` are the same Gmail, a match goes to the existing-account confirmation, never a silent link); this ticket only turns Google on and checks it end to end. **Create the provider without a `firstBrokerLoginFlowAlias`** so it uses the realm binding `sportconnect first broker login` (A35 verified this on a stub provider).
- A social login of a deactivated account reactivates it (the A26 rule), checked for Google.
- Re-check first-broker-login with the A27 validators (`sc-email-or-phone`, `sc-unique-phone`, username filler), which A27 did not exercise with a real provider.
- Document how the owner creates the Google OAuth client and which redirect URI to register.

## Original wording (Google + Facebook + Zalo; Facebook and Zalo now A34)

- Google and Facebook as built-in identity providers; **Zalo as a generic OIDC/OAuth provider**. First check Zalo's real claims and whether it returns a phone or an email (A23 only used a stand-in).
- Linking policy: auto-link only on a provider-verified email, **never by phone**; the Zalo no-email path ends on the profile page when neither identifier exists (A27's validator, or A26's fallback).
- Social login of a deactivated account reactivates it (the A26 rule), covered for each provider.
- Apple and GitHub are not configured.
- Realm settings land in the INFRA-13 import (no secrets in the repo); document how the owner creates each provider app and which redirect URIs to register.

## Out of scope

Unlinking a provider, contact import, the mobile app, the buttons themselves (the theme, AUTH-15).

## Done when

A real Google login works locally and is recorded here (or marked **not verified** rather than assumed). Facebook and Zalo are done in A34.
