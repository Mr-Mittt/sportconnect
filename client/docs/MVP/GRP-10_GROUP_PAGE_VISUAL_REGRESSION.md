# GRP-10 · Visual regression harness for the Group page

**Status:** `DONE`
**Type:** Infrastructure (Testing)
**Depends on:** none (GRP-1..GRP-9 all `DONE` — the page this covers already exists)
**Filed:** 2026-08-18, closing a gap `GRP-1` explicitly flagged and never followed up on: *"No
visual-regression harness added yet for this page (`design-reference-group-feed.html` has no
frozen-baseline Playwright spec the way Home Feed's HF-10a/b or the post modal's FEED-11 do)"* —
listed under GRP-1's own "Known follow-ups (not this ticket)" as *"Visual-regression coverage for
`#groups-view` (HF-10a/b-style harness)"*, filed now rather than left as a loose note in that
ticket's file.

Adds a `visual-regression` Playwright spec for the Group page (`#groups-view`), matching the
existing `app-home-feed.spec.ts` (HF-10a/b) harness shape: full-page screenshots (not
dialog-scoped — this is a page, not a modal, same reasoning `app-home-feed.spec.ts` already uses)
across the standard 3 breakpoints, diffed against committed baselines, Linux-rendered via the
`client-ci` workflow's `update-baselines` dispatch. Consumed by CI on every PR touching the Group
page, same as the two existing visual-regression specs.

Which states get their own baseline (owner view vs. member view vs. non-member discovery view;
which of the Posts/Chat/Settings tabs; loading/empty states) is a Phase 3 design decision for
whoever picks this up — GRP-1's build already exercised all of these, so the real states to freeze
are known, just not yet chosen/prioritized into a concrete baseline set here.

**Out of scope:** any new Group page functionality — this is baseline coverage for what GRP-1..GRP-9
already shipped, not a design or behavior change. `GroupChatTab`'s content is still a local-state
mock (per GRP-1) — the visual target is whatever it currently renders, not a future real-chat state.

**Tests:** the spec itself *is* the test — no separate unit/component test coverage implied by this
ticket.

---

## Implementation

**Delta (correction to this ticket's own text above, found at pickup):** the "Out of scope" note
claiming *"`GroupChatTab`'s content is still a local-state mock (per GRP-1)"* is stale. Checked
`GroupChatTab.tsx` directly — its own docstring says *"wired to the real chat service (CHAT-8)"*,
confirmed by `group-chat.spec.ts` (CHAT-8/10/13/15, real send/edit/delete/persistence via a mocked
chat backend). GRP-1's "no chat backend exists yet" note predates that work landing. Doesn't change
this ticket's scope (still baseline coverage of what the page currently renders, no new
functionality) — just changes what the `chat-tab` baseline actually needed to seed.

**States chosen (6, the "full set" option, user decision):**

| State | Setup |
|---|---|
| `discovery` | No group selected (default landing) |
| `owner-posts` | `mockOwnedGroup` ("Weekend Tennis Ladder", Pickleball), Posts tab, Broadcast toggle clicked on — owner-exclusive UI (FEED-7). Feed is legitimately empty (no fixture ties a post to this group) |
| `member-posts` | `mockGroup` ("Friday Night Football", Badminton), Posts tab — real seeded content, no Broadcast toggle |
| `members-tab` | `mockOwnedGroup`, Members tab — all 5 status-grouped sections |
| `settings-tab` | `mockOwnedGroup`, Settings tab |
| `chat-tab` | `mockGroup`, Chat tab — one message sent live through the real composer (MSW-persisted), not a static mock render, per the Delta above |

6 states × 3 breakpoints (375/768/1280) = 18 baselines, `groups-<state>-<width>.png`, same naming
convention as `app-home-feed.spec.ts`'s `home-feed-<state>-<width>.png`.

**Built:** `client/e2e/visual/app-groups.spec.ts`, full-page screenshots (`fullPage: true`, not
dialog-scoped — matches `app-home-feed.spec.ts`'s reasoning, not `app-post-modal.spec.ts`'s, since
this is a page). Clock frozen at the same instant as the other visual specs, for consistency (this
page has no clock-sensitive content in any of these 6 states — `GroupChatTabView` renders no
message timestamps).

**Real flakiness found and fixed during verification (not local-Windows noise — reproduced 3x in a
row before the fix, 0x in 3 consecutive runs after):** screenshotting immediately after asserting one
landmark per state raced this page's several independent queries (settings, group info, members,
approval queue, sent invitations, hashtags, broadcasts) — whichever hadn't resolved yet caused a
late layout shift, failing `toHaveScreenshot`'s own "two consecutive stable screenshots" stability
check (page height jumping ~30–150px, occasionally toggling the vertical scrollbar and shifting
width too). Root cause: `GroupSettingsTab`/`GroupMembersTab`/`GroupDiscoveryPanel` and the right
rail's `TrendingHashtags`/`GroupBroadcasts` all share the same `Skeleton` (`.animate-pulse`) /
"Loading…" placeholder shape. Fixed with a `waitForContentSettled(page)` helper — waits for zero
`.animate-pulse` elements and zero "Loading…" text — called right before every screenshot across
all 6 states, not just the ones that happened to flake first.

**Baselines — Windows-rendered locally, need the Linux swap before this is truly done (same
"chicken and egg" HF-10b and SPORT-4 both hit — I can't trigger a GitHub Actions
`workflow_dispatch` from here):** the 18 PNGs currently committed under
`client/e2e/visual/__screenshots__/groups-*.png` were generated via `pnpm test:visual
--update-snapshots` on this Windows dev machine, then verified stable across 3 consecutive
`pnpm test:visual` re-runs (no `--update-snapshots`) with zero diffs. **Remaining step for
whoever merges this:** GitHub → Actions → `client-ci` → Run workflow → `update-baselines: true` →
download the `visual-baselines` artifact → replace `client/e2e/visual/__screenshots__/groups-*.png`
→ commit. Until that swap happens, CI's real (Linux) runs of this spec will show font-rendering
diffs against the Windows set, same documented behavior as every other visual spec in this suite
before its own Linux swap.

**Verification:** `pnpm exec tsc -b` clean, `pnpm exec eslint .` clean (0 errors — 2 pre-existing
warnings in an unrelated file), full `pnpm exec vitest run` green (878/878, 129 files — this ticket
adds no unit-tested code, so this just confirms nothing else broke), `pnpm test:visual
app-groups.spec.ts` stable 3/3 local runs. `client/docs/E2E_OVERVIEW.md` updated (§3 directory
listing + a new §6 catalog entry, matching `app-home-feed.spec.ts`'s entry shape).
