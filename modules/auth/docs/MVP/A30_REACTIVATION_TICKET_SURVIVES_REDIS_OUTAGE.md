# A30 · The re-activation ticket survives a Redis outage

**Status:** `TODO` · **Type:** Hardening, low priority · **Depends on:** A26 · **Gates:** nothing

**Filed:** 2026-10-14, from A26's design review. The user accepted the gap for A26 ("Redis state should not block the app functionality, just document it as a known gap").

## The gap

A26 parks the Keycloak session of a deactivated **password** user behind a `reactivationTicket` held only in Redis (`ReactivationTicketStore`, 5 minute TTL). Everything else on the request path degrades around a Redis outage (A11, A25: the per-request gate falls back to the database), but the ticket has no database copy. With Redis down:

- the sign-in of a deactivated password user cannot issue a ticket, so `POST /api/auth/callback` answers a retryable `503 SERVICE_UNAVAILABLE` and ends the Keycloak session (otherwise the next attempt would sign in silently and loop);
- a ticket issued just before the outage cannot be confirmed or cancelled (`/reactivate` and `/reactivate/cancel` answer 503 as well).

Active users, social sign-ins (they are re-activated at once, no ticket) and every refresh and request are unaffected. Only a deactivated password user who wants to come back during the outage is blocked, and only until Redis returns.

## What

Make the ticket survive the outage. The likely shape, to confirm when picked up:

- Keep Redis as the fast path, and write the ticket to Postgres too (a small `reactivation_tickets` table in the auth domain: hash of the ticket, `user_id`, the parked refresh token, `expires_at`; a unique hash; no cross-domain foreign key), so `consume` falls back to the database when Redis is unreachable. Single use must hold across both stores (delete in both, atomically per store).
- The parked refresh token is a live credential: decide whether it is stored encrypted at rest (the Redis copy lives 5 minutes; a database row could outlive a failed cleanup), and add an expiry sweep.
- Or the cheaper alternative: accept the gap permanently and only document it for operations (what the 503 means, how long it lasts). Decide with the owner first; this is a judgement call, not an obvious fix.

## Out of scope

The per-request gate and the access-state cache (already degrade to the database, A25); any other use of Redis.

## Done when

An IT that stops Redis (or fails the store) shows a deactivated password user can still be given a ticket and confirm it, with the single-use and 5 minute rules intact; or this ticket is closed as "accepted, documented" with the owner's decision recorded here.
