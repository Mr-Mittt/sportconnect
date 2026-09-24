# Agent token-cost notes

Running log of observations about what actually costs tokens when Claude Code works on this repo,
kept so a later analysis has real data points instead of impressions. **Append new entries at the
bottom; don't rewrite old ones.** Each entry: date, what was done, the measured number, what it does
and doesn't prove.

## Standing rule (in force since 2026-09-24)

- **No forked subagents for verification** (test/e2e runs).
- **No full Vitest / Playwright runs by default** — scoped runs of what the diff touches, inline, with
  filtered output. A full run only when the user asks. Where a command such as `/workon` says the full
  e2e project is mandatory, the scoped subset is run instead and the ticket summary says so plainly.

Memory copy of the rule (outside the repo, per-user):
`~/.claude/projects/D--sportconnect/memory/feedback_no_fork_no_full_suite.md`.

## Entry 1 — 2026-09-24, CLIENT-SESSION-23 (client), forked full-suite runs

**Context:** a long single session (backend SESSION-43 + client CLIENT-SESSION-23, both picked up via
`/workon` in the same conversation). Two verification steps were delegated to a `fork` subagent
(`subagent_type: "fork"`, which inherits the parent's whole conversation) so the raw test output would
stay out of the main context.

| Fork | Task | Reported subagent tokens | Tool calls | Wall clock | Result returned |
|---|---|---|---|---|---|
| 1 | full Vitest suite | ~431k | 2 | ~7.8 min | 194 files / 1454 tests, 5 files failing (all the retired `/sessions/mine` contract) |
| 2 | `tsc -b` + full Vitest + full `e2e` project | ~551k | 3 | ~9.7 min | tsc clean, 197 files / 1482 tests green, e2e 87/87 |

**Reading of the numbers:**
- The token figures are the tool's own `subagent_tokens` totals. They are dominated by the fork
  re-reading the inherited conversation on each of its turns, not by the test output — 2–3 tool calls
  cannot account for 430–550k tokens otherwise. A fork's cost therefore **grows with how long the
  parent session already is**.
- Part of that is cached input, billed cheaper than fresh input. The figures are usage counts, **not**
  a billing amount; billing was not observed.
- For comparison, the same runs done inline with `| tail` would have added only the few printed lines
  to the parent conversation (order of a few thousand tokens, carried forward each turn). **No inline
  measurement was taken in this session** — that comparison is an estimate, not a data point.
- The suite itself is not the token cost; its costs are wall-clock time (Vitest ~5 min, e2e ~1.5 min on
  this Windows host) and, when run inline unfiltered, output volume.

**Earlier belief this corrects:** an earlier memory note recommended forking noisy full-suite runs to
keep raw output out of the main conversation. That reasoning holds for the *parent's* context but ignores
the fork's own inherited-context cost, which was larger than the output it hid at this session length.

**Open questions for the later analysis** (worth measuring rather than assuming):
1. Inline filtered full-suite run vs. fork, same session length — actual token delta.
2. Fork cost as a function of parent session length (a fork early in a session vs. late).
3. Cost of a scoped-only verification policy against how often it misses a regression the full suite
   would have caught (this ticket's first full e2e run caught one: the `mockPreparingSession` fixture
   inflating the Pickleball-filtered rail count in `home-feed-journey`; a scoped run of only
   `matches-journey` would have missed it — though the `/workon` diff-grep over `e2e/mocks/fixtures.ts` may well have
   selected `home-feed-journey` too, so whether a scoped policy would have caught it is itself untested).
