# CLIENT-SESSION-22 · Wire Discover search/filter UI to SESSION-25's backend contract

**Status:** `TODO`
**Type:** Client feature
**Depends on:** backend **SESSION-25** — hard, needs the query-param contract to build against.
**Filed:** 2026-09-14, companion to SESSION-25 — user explicitly asked for this as a separately
filed client ticket rather than a prose mention.

## Scope

1. Wire the currently-inert Date/Time/Location filter pills (from CLIENT-SESSION-6's design
   export, never wired — CLIENT-SESSION-7 only extracted the client-side title/location substring
   search) to SESSION-25's new server-side query params, on both the `/matches` Discover panel
   (`SessionDiscoverPanel`) and the "Join a match" modal (`SessionDiscoverModal`) — both already
   share `useDiscoverModalData`, so the new filter state/params belong there.
2. Replace the existing client-side substring title/location filter with the new server-side
   `title` param (still debounced client-side before firing the request); location moves from
   substring match to the new exact `locationId` filter pill.
3. Default filter state on load matches the server's new default (status: all 3, date/time:
   `now()`-forward) — per the user's explicit answer that the client mirrors the server's default.

**Out of scope:**
- SESSION-26's attribute filter UI — no backend yet.
- The `PREPARING`-status warning and completion UI — **CLIENT-SESSION-21**.
- Any new location-search or gear/equipment UI — still no such domain, per CLIENT-SESSION-6's
  original deferral.

**Tests:** Vitest for the new filter param wiring; MSW handler updates for the new `/discover`
query params; updated `matches-journey` e2e for at least one real filter.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
