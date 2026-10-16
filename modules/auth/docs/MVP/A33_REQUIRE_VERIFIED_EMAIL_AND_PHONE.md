# A33 · Require a verified email and phone before a password sign-in

**Status:** `TODO` · **Type:** Enhancement (security) · **Depends on:** A28, A27 · **Gates:** nothing

**Filed:** 2026-10-16, from A28's pickup. The user chose to keep the realm's `verifyEmail` off in A28 and to enable it together with phone verification in one later ticket.

## What

After A28, Keycloak sends the verification email but nothing requires it: the realm has `verifyEmail: false`, so a password user gets in without clicking the link. This ticket turns verification on for both identifiers at once:

- **Email.** Set `verifyEmail: true` in the realm (admin-API script under `infra/scripts/`, mirrored in `infra/keycloak/realm/sportconnect-realm.json`). A password user then lands on Keycloak's "verify your email" page after registering and gets no session until the link is clicked; the link continues the sign-in when opened in the same browser. The verification link already lives 12 hours in this Keycloak (checked in A28 from a sent mail), so there is nothing to raise; confirm the value in the realm when this is picked up. Check the verify-email page's look and en/vi copy in the Keycloakify theme (`login-verify-email.ftl` has a Storybook story only).
- **Phone.** Verify a phone number (OTP, or Zalo) and set `phone_status` to `VERIFIED`; nothing sets it today (A27 and the Keycloak extension decide where the check lives). Decide what an unverified phone may do (login identifier only after verification, per A27's rules).
- **Existing users.** Dev users created before this have no verified email and would be asked to verify at their next password sign-in; decide whether to mark the dev set verified in the realm or let them verify.

Why it matters: A29 links a social login to an existing account on a verified email. An unverified password account holding someone else's address would let that person's real Google login merge into it.

## Not affected

Social sign-ins (the provider vouches for the email), and accounts with no email (A22).

## Out of scope

Providers (A29); recovery for accounts with no email (A22).
