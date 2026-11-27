# CLIENT-GROUP-GEO-1 · Country and region on the group create and edit forms

**Status:** `TODO`
**Type:** Enhancement · **Depends on:** B25 (server: a group has a required country and region)
**Filed:** 2026-11-27, the client half of B25, filed at the pickup of SESSION-55 (group seasons need the group's local date and country rules).

The group create form pre-fills country and region from the signed-in owner's profile and the owner can change them (a region list that follows the chosen country, from the reference endpoints the register page already uses); the group edit form shows and changes them; the group page shows them. A region of another country is refused by the server (its error code gets en and vi copy here). en and vi for every string.

**Out of scope:** the timezone (derived by the server), season screens (CLIENT-SESSION-43).
