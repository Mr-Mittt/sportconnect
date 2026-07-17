# FEED-9 · QA / acceptance checklist (integration)

**Status:** `DONE` (2026-07-17) · **Type:** QA · **Dependency:** FEED-10 · **Spec:** AUTH/FEED epic § FEED-9

## Scope (Phase 3 plan, as approved)

FEED-9 closes out Phase 6 (feed/groups/sport integration). It has no build surface of its own — it's
a verification pass over everything Phases 5–6 shipped, run against **the real backend**, not MSW
(MSW-mocked coverage already exists via FEED-10's E2E suite and doesn't substitute for this pass per
the epic's own item 2 wording). The checklist, per the epic doc plus the backlog's delta note:

1. Every mock data hook from Home Feed (HF-3, HF-5, HF-6) has been swapped for its real counterpart
   with no visible UI regression.
2. Pagination, optimistic likes, and comment counts verified against a real backend with more than
   one page of data — a separate, manual pass; FEED-10's E2E suite is MSW-mocked and doesn't
   substitute for it.
3. Broadcast expiry and owner/admin-only broadcast creation verified with a non-admin test account
   (should not see the create action).
4. FEED-10's E2E suite passes in CI.
5. (Backlog delta) HF-2's mock swapped for SPORT-1's real hook with no visible UI regression, same
   bar as HF-3/HF-5/HF-6.

Plan approved with the user upfront: stand up the local backend (already-running dev Postgres/Redis
+ a fresh `:server:bootRun`), register real test accounts rather than reuse anything assumed to
exist, and — per the same caveat AUTH-7 already established for "passes in CI" — treat a local
`pnpm e2e` run as the evidence for item 4, flagged as CI-unverified pending a human spot-check of the
actual `client-ci` GitHub Actions run (no GitHub access in this session).

## Environment

- Dev deps already running (`docker compose -f infra/docker-compose.dev.yml`, up 41h+ from prior
  sessions) — Postgres+PostGIS on `:5432`, Redis on `:6379`.
- Backend started fresh via `.\gradlew.bat :server:bootRun` (`:8080`), verified live via
  `GET /api/sports` (not `/actuator/health`, which 500s — that endpoint isn't exposed as a REST
  resource in this app, a pre-existing non-issue, not a FEED-9 finding).
- Client dev server via `pnpm dev` (`:5173`).
- Fixtures created directly against the real backend (not seeded via migration): two accounts
  (`feed9owner@test.com` / `feed9member@test.com`), each with a Tennis (`sportId=2`) sport profile,
  sharing one real group ("Feed9 QA Tennis Club", owner = `group_owner`, member = `group_member`) —
  and a third zero-sport-profile account (`feed9zero@test.com`) for SPORT-1's edge case. 21 posts
  seeded on the owner's personal feed (page size is 20 — FEED-10's own E2E spec independently landed
  on the same number for the same reason) to force a genuine second page.
- No dedicated browser tool was available in this session; verification used a one-off Playwright
  driver script (`chromium` via `@playwright/test`, not committed — scratch-only) to log in through
  the real UI and screenshot each state, plus direct `curl` calls against the real backend to
  cross-check what the UI showed against the actual API responses.

## Results

### Item 1 — HF-3/HF-5/HF-6 real-data swap, no visible regression: **PASS**

Live-verified Home Feed and the Groups page against the real backend. Feed (real posts, pagination,
sport badges), TrendingHashtags (real `#tag`/count rows, including hashtags incidentally produced by
this session's own test post content — see note below), and GroupBroadcasts (real broadcast row,
correct group name/initials) all render correctly with no visual regression against the
already-shipped baseline layout. Screenshots taken at 1280px for Home Feed and the Groups page in
both `All` and group-selected states.

**Incidental finding, not a regression:** test post content that happened to contain literal
`#1`–`#21` (e.g. "pagination test post #7") got extracted as real hashtags by the backend's
`#(\w+)` regex and briefly polluted the real Trending card. This is expected regex behavior, not a
bug — noted here only so a future QA pass doesn't reuse `#N`-style content in test posts and confuse
itself the same way.

### Item 2 — Pagination/likes/comments against a real backend, 2+ pages: **PASS**

- Confirmed via direct API calls that `GET /api/posts/feed` correctly returns `totalElements: 21`,
  `totalPages: 2`, page 0 = 20 items (`last: false`), page 1 = 1 item (`last: true`).
  the UI: navigating to Home Feed auto-loaded all 21 posts via infinite scroll (no explicit
  "Load more" click needed once scrolled, though the button is present per HF-8's keyboard-reachable
  fallback requirement — confirmed rendered at rest before scrolling).
- Optimistic like: clicking a post's like button flipped its count `0 → 1` immediately (no
  network round-trip wait visible), unliking reverted it.
- Comment: opened the comment dialog on a post, posted a comment, dialog showed it immediately and
  the underlying post card's comment count incremented `0 → 1` — confirmed in a full-page screenshot
  after closing the dialog.

### Item 3 — Broadcast expiry + owner/admin-only creation: **PASS (permission gating); real backend bug found on expiry, filed, doesn't affect shipped UI**

**Permission gating — confirmed correct.** Selecting the shared group as the owner account shows the
composer's "Broadcast" toggle; the same group selected as the plain-member account does not — visually
confirmed via screenshots of both accounts' composer action rows side by side.

**Expiry — found a real, latent backend bug, filed as `A11` in
`modules/social/post-impl/docs/BACKLOG_MVP.md`, left `TODO` (not fixed in this ticket — out of
FEED-9's own scope, and per the project's established pattern of filing rather than silently fixing
backend bugs discovered during client QA, e.g. A9/A10 from FEED-0).** Root cause: `broadcastEndTime`
is validated/defaulted using the **application server's JVM-local clock** (observed at UTC+7 in this
dev environment), but the JPQL `CURRENT_TIMESTAMP` used by `findActiveBroadcasts`/
`existsActiveGroupBroadcast` to decide "is this still active" resolves against the **database
server's clock**, which is UTC in this dev Postgres container. Live-reproduced: a broadcast created
with an explicit near-future `broadcastEndTime` (passed the "must be in the future" check against the
app server's own clock) was immediately excluded from `GET /api/posts/broadcast` because its stored
value read as already-past relative to the DB's `CURRENT_TIMESTAMP`.

**Why this doesn't block FEED-9 or affect anything already shipped:** the real client
(`CreatePostForm`'s broadcast toggle) never sends `broadcastEndTime` — it always lets the server
default to `now()+24h`, computed and compared using the *same* JVM-local clock on both ends, so the
~7h skew is dwarfed by the 24h margin. Live-verified this exact default path separately: a broadcast
created with no explicit end time appeared correctly and immediately in
`GET /api/posts/broadcast`, and rendered correctly in the Groups page's "Group broadcasts" rail card
in the real UI (screenshot captured). The broadcast-update flow (`UpdateBroadcastConfirmDialog` →
`useUpdatePost`) also never touches `broadcastEndTime`. So today's shipped UI never exercises the
broken window — this is a correctness bug worth fixing, not a visible regression.

### Item 4 — FEED-10's E2E suite passes: **PASS locally; CI-unverified (same caveat as AUTH-7)**

- `pnpm e2e feed-groups-journey` (both FEED-10 specs): **2/2 passed**.
- Full suite, `pnpm e2e`: **31/31 passed** (re-run after this ticket's `GroupsPage.tsx` fix below, to
  confirm no regression from it).
- `pnpm test` (Vitest): **341/341 passed**.
- `pnpm exec tsc -b --noEmit`: clean.
- **Not verified**: an actual GitHub Actions `client-ci` run — this session had no GitHub access,
  identical caveat to AUTH-7's item 5. Flagged as a follow-up for a human to spot-check the real CI
  run once this ticket's branch is up.

### Item 5 (delta) — SPORT-1 sport switcher real hook, no regression: **PASS**

Verified both of SPORT-1's own documented acceptance-criteria edge cases live against the real
backend, not just the happy path:
- **Zero sport profiles** (`feed9zero@test.com`): renders "All" + "Add sport" only, no page break, no
  console errors, feed filter still works ("No posts yet for this sport."). Screenshot captured.
- **At-cap (3 profiles)**: brought the owner account to 3 sport profiles (Tennis, Soccer,
  Basketball); "Add sport" pill renders with `aria-disabled="true"`, matching HF-2's already-approved
  delta (always rendered, disabled at cap — not hidden). Screenshot captured.

## Real bug found and fixed in this ticket (not filed separately — trivial, 2-line diff)

While driving the Groups page for item 1/3's manual pass, a real React "duplicate key" warning fired
reliably on every Groups page load: `src/features/groups/GroupsPage.tsx`'s `CreateGroupModal` and
`AddSportModal` are both direct siblings of `<main>` and were both keyed by a per-open remount
counter (`createGroupOpenCount`/`addSportOpenCount`) that both start at `useState(0)` — so before
either modal had been opened once, both elements shared the literal key `"0"`. React's duplicate-key
check applies across siblings regardless of element type, so two different component types sharing a
key value still triggers the warning. Functionally harmless (React still distinguishes them correctly
during reconciliation since they're different types), but a genuine, reproducible dev-console warning
— fixed by namespacing each key (`` `create-group-${createGroupOpenCount}` `` /
`` `add-sport-${addSportOpenCount}` ``). Verified fixed via a targeted repro script capturing the full
warning args before and after; re-ran the full `pnpm e2e` (31/31) and `pnpm test` (341/341) suites
after the fix to confirm no regression.

## Out of scope / not re-verified here

- `DialogOverlay` (`src/shared/ui/dialog.tsx`) triggers a `React.forwardRef` console warning
  ("Function components cannot be given refs") on every dialog open (comment, hashtag results, create
  group, join group, add sport, broadcast confirm) — pre-existing since FEED-2, not introduced by any
  de-mocking work in this MVP, not called out by any FEED-9 checklist item, and not a visible UI
  regression (dialogs open/close/function correctly). Flagged here for a future ticket, not fixed.
- Actual `client-ci` GitHub Actions run (item 4) — see above.

## Backend follow-up filed

- **A11** (`modules/social/post-impl/docs/BACKLOG_MVP.md`, `TODO`): fix the JVM-local vs. DB-UTC
  timezone mismatch behind broadcast-expiry comparisons. Full root cause and repro steps in the
  ticket entry.
