# CLIENT-SESSION-31 · Visual regression coverage for the Discover surfaces + baseline refresh

**Status:** `DONE` (2026-09-24)
**Type:** Infrastructure (Testing)
**Depends on:** none (CLIENT-SESSION-22, -29 and -30 are all `DONE`)
**Filed:** 2026-09-24, closing the gap `CLIENT-SESSION-22` explicitly noted: *"`visual-regression`
project: no spec exists for the Matches page's Discover panel… not run"*. Filed alongside the
still-pending baseline regeneration that `CLIENT-SESSION-23` and `CLIENT-SESSION-30` both deferred
to the `update-baselines` dispatch. Written against the **current shipped** Discover UI (post
`CLIENT-SESSION-29`'s redesign), not the version `CLIENT-SESSION-22` originally built.

Adds `visual-regression` Playwright coverage for every Discover surface, following the harness
shape of `app-session-detail-modal.spec.ts` / `app-create-session-modal.spec.ts`
(CLIENT-SESSION-12): the standard 375/768/1280 breakpoints, Linux-rendered baselines produced by
the `client-ci` workflow's `update-baselines` dispatch (a Windows-local visual run is wholesale
noise and is not evidence). Surfaces:

1. **`/matches` Discover panel** (`SessionDiscoverPanel`) — default (today's section expanded),
   multi-date collapsed sections, empty / no-results, and a section with "Load more" visible.
2. **`SessionDiscoverModal`** ("Join a match", opened from the rail CTA) — today-only flat list,
   the "Discover more" footer, and the empty state.
3. **Open filter popovers** — Date, Location and Time, each open both in the panel and *inside the
   modal* (the modal case is where CLIENT-SESSION-22's `pointer-events` bug lived, so a
   screenshot there guards the popover's layering).
4. **"Requested sessions" section** on `/matches` (the `GET /sessions/requested` section added by
   CLIENT-SESSION-29).

**Baseline refresh, same round.** The same `update-baselines` dispatch + `/updatebaseline` run
also regenerates the existing baselines that `CLIENT-SESSION-23` and `CLIENT-SESSION-30`
legitimately changed (session cards, detail header time range / approval-mode label, the
seeded-JOINED-row participant counts on the full-page `home-feed-*`, `groups-*`, `profile-*`
shots, and the `session-detail-*` / `create-session-*` files), so the whole set lands in one PR
rather than yet another separately-dispatched baseline round. Every regenerated file is
eyeballed before commit, and any baseline that changes but was *not* predicted by the two tickets
above is investigated rather than accepted.

Fixtures come from the existing MSW mock server (`e2e/mocks`); new seeded states (empty
discover, multi-date counts, load-more, a requested session) are added there if the current
fixtures don't reach them. Use the `sessionsEmpty`-style override pattern for empty states.

**Out of scope:** any behavior or design change to the Discover UI; fixing
`CLIENT-SESSION-27` (Escape closing the whole modal) — popover screenshots are taken with the
popover opened by click, never dismissed with Escape; full-page screenshots of the pages the rail
modal opens over (already covered by their own full-page specs).

**Tests:** the specs themselves are the test — no separate Vitest coverage implied. Verify by
running the new spec on CI (via the dispatch) and confirming a deliberately-perturbed CSS change
to one Discover surface fails it.

## Implementation summary (2026-09-24)

**Status of the ticket:** `DONE` — specs, mock support, docs and (see **Executed** at the end) the
Linux-rendered baselines are all in.

**Design (approved Phase 3 plan, as built):**

- **Mock support (`e2e/mocks/`).** New `discoverVolume` override (`overrides.ts`, `mockServer.ts`'s
  `OVERRIDE_NAMES`, `fixtures.ts`'s `seedDiscoverVolumeOnNextLoad`). In `handlers/sessions.ts`,
  `discoverableSessions` gained a `sessionId` parameter and, with the flag on, appends 25 synthetic
  Badminton sessions (`syntheticDiscoverable()`, cloned from `mockDiscoverableSession`); `/discover`
  pages them with the existing `slicePage` only when the flag is on, otherwise still returns
  `mockPageResponse`. `/discover/counts` reads the same pool. Consumer census: `matches-journey` and
  `home-feed-journey` (the only e2e consumers of `/discover`) never set the flag → compatible as-is;
  re-run green.
- **`e2e/visual/app-discover-panel.spec.ts`** — 8 states × 3 breakpoints (default, multi-date, empty,
  load-more, requested, date/time/location popover), region-scoped.
- **`e2e/visual/app-discover-modal.spec.ts`** — 4 states × 3 (default, empty, time/location popover),
  dialog-scoped; reached via the existing `sessionsEmpty` override + the rail's "Join a match".
- **`e2e/visual/discoverClip.ts`** — `clipAround`, `settle`, `pinDiscoverCountsToDate` (see below).
- **36 baselines to generate**, all under `e2e/visual/__screenshots__/discover-*.png`.

**Divergences from the approved plan, and things the local frames caught:**

1. **Multi-date closes its popover with Escape, not an outside click** — the plan said click; on
   `/matches` there is no Dialog, so Escape is safe (`matches-journey` step 10b already does it), and it
   is deterministic. The modal specs still never use Escape (CLIENT-SESSION-27).
2. **A clock mismatch made the first frames wrong ("Today (0)" above a visible card).** The mock's
   `/discover/counts` default window is computed from the real clock; the specs freeze the browser's.
   Fixed with `pinDiscoverCountsToDate` (a `page.route` that adds `date=2026-07-07` to a `date`-less
   request), not by touching the mock — the mock is a faithful stand-in for the real backend, which
   would count today's sessions. Any future frozen-clock spec that renders a counts header needs it.
3. **Sport icons still loading rendered as blank circles**, so `settle()` also awaits `<img>` load
   (the other visual specs only await `document.fonts.ready`).
4. **`clipAround` had two real bugs found by the frames/stress run:** it clamped to the viewport
   before adding the scroll offset (cropped the region's top after the page scrolled), and the popover
   tests measured the clip before the cards had loaded (region grew 565→592px; 2 of 72 runs failed
   under `--repeat-each=2`). Fixed: scroll offset added first; `waitForPanelLoaded` before measuring.
5. **Filed a real app bug found by the frames:** `CLIENT-SESSION-32` — the Location popover is clipped
   by the modal's right edge at 375px. **This ticket's `discover-modal-location-popover-375`
   baseline will therefore record the clipped rendering** and must be regenerated when
   `CLIENT-SESSION-32` lands (that ticket owns it).

**Verification (local, Windows — the only thing this host can prove is same-machine determinism):**
`tsc -b` and `eslint e2e/visual e2e/mocks` clean; `--update-snapshots` → all 36 frames viewed;
re-run without the flag `--repeat-each=4` → **144/144 green**; a deliberate colour change to
"No more to load." in `DiscoverResultsList.tsx` failed both the panel and the modal `default` specs
(then reverted — `git status` on `src/` clean). The local PNGs were **deleted, not committed**.
No `src/` file is changed by this ticket. No browser walkthrough or real-backend run applies (test
and mock support only).

**E2E:** scoped run, not the full suite (standing token-saving rule) — `e2e` project, the two
consumers of the changed `/discover` handler: `matches-journey.spec.ts` + `home-feed-journey.spec.ts`
→ **8 passed**. The full `e2e` project was **not run**; the Vitest suite was **not run** (no `src/`
change).

**Visual-regression expectation:** (b) — the 36 new `discover-*` baselines do not exist yet, so the
new specs **fail as "missing snapshot" until the `update-baselines` dispatch generates them**. The
existing baselines that `CLIENT-SESSION-23` and `CLIENT-SESSION-30` legitimately changed
(`session-detail-*`, `create-session-*`, and the full-page `home-feed-*`, `groups-*`, `profile-*`
where cards/participant counts/the detail header render) are expected to differ in the same dispatch;
everything else must come back byte-identical. No baselined surface is changed by *this* ticket's
own code (test-only), so any diff beyond that predicted list is to be investigated, not accepted.

## Executed (2026-09-24) — baselines applied

`client-ci` `update-baselines` dispatch on this branch → `visual-baselines` artifact (150 PNGs) → `/updatebaseline`.
SHA-256 against the committed set (111 files): **60 changed, 39 new, 51 byte-identical, 0 missing.** Applied
exactly the 99 changed+new files (`a566952`).

- **New (39):** the 36 `discover-*` baselines as designed, plus `session-detail-preparing-{375,768,1280}` — the
  `PREPARING` creator state CLIENT-SESSION-23 added a spec case for but never had baselines generated.
- **Changed (60), all predicted by CLIENT-SESSION-23/30:** all 7 pre-existing `session-detail-*` states (21),
  `groups-*` (18), `home-feed-default`/`-pickleball` (6; `-empty` stayed identical), and `profile-*` (14:
  edit-profile-modal 768/1280, memories, posts, settings, settings-inactive). The 51 identical ones confirm the local
  Windows diffs on everything else were pure noise floor.
- **One unpredicted change, applied on the user's decision:** `create-session-no-sport-profiles-1280.png` (both
  tickets said create-session stays identical). Same 448×424 size and content on inspection; sub-pixel Linux
  antialiasing drift, the same class as the `already-joined-375` drift recorded in `E2E_OVERVIEW.md`. Applied because
  CI rendered it differently from the committed file, so the PR's own visual job would otherwise fail on it.
- **Eyeball check (CI-rendered frames):** discover panel shows "Today (1)" with icons loaded; session detail shows the
  24h range, the "Waiting for host approval." hint beside Cancel, the "Need host approval." label, and the new Preparing
  state; the Home rail shows the seeded JOINED rows ("Leave" / no button). Nothing drifted beyond the prediction.
- **Known:** `discover-modal-location-popover-375` records the popover clipped by the dialog's right edge —
  **CLIENT-SESSION-32** owns fixing that and regenerating it.
