# GRP-10 · Visual regression harness for the Group page

**Status:** `TODO`
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
