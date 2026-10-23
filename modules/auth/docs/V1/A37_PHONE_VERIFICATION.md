# A37 · Phone verification (OTP or Zalo) and `phone_status` `VERIFIED`

**Status:** `TODO`
**Type:** Enhancement (security)
**Depends on:** the phone-OTP delivery decision (see `documentation/md/NEXT_TOPICS.md`, "Phone account"); A27 (the phone rules and the Keycloak extension JAR)
**Filed:** 2026-10-20, split out of A33 at pickup: the owner narrowed A33 to email verification as an optional step, and the phone half waits for how a phone code is delivered.

Verify a phone number (an OTP, or a Zalo check) and set `phone_status` to `VERIFIED`; nothing sets it today. A27 stores a phone in E.164 when it parses and as typed (backend status `INVALID`) when it does not, and a phone-only account can exist. What this ticket decides: where the check lives (a new provider in `infra/keycloak-extensions`, or a backend step), whether an unverified phone may still be a login identifier (A27's rule is identifier only once it parses), and what a verified phone unlocks. It should follow the same shape as A33: a flag, not a gate, unless the owner says otherwise.

**Out of scope:** email verification (A33); recovery for accounts with no email (A22); the delivery provider choice itself (the decision this waits for).
