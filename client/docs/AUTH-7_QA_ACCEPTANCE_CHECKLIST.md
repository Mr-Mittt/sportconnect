# AUTH-7 · QA / acceptance checklist (auth) — results

**Ticket:** AUTH-7 (`client/docs/BACKLOG_MVP.md` #24, spec in `sporthub-auth-feed-integration-tickets.md` § AUTH-7)
**Date:** 2026-07-13
**Status:** DONE — 5/5 items pass.

## Checklist results

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Login, register, logout, session-restore-on-refresh verified against a real running backend | ✅ | Ran `./gradlew :server:bootRun` (port 8080) + `pnpm dev` (port 5173) against the local Postgres/Redis. Drove the real UI with a standalone Playwright script (no MSW) through: register → auto-login → reload (session restores from the httpOnly cookie, no redirect to `/login`) → logout (redirects to `/login`) → deep-link to `/` while logged out (redirects to `/login`) → login again (lands on home). 8/8 assertions passed. Also verified the raw HTTP contract directly with `curl`: `register`/`login`/`refresh` all respond `200` with `Set-Cookie: refreshToken=...; Path=/api/auth; HttpOnly; SameSite=Strict` and no `refreshToken` field in the JSON body; `refresh` rotates the token (`jti` changes) on each call. |
| 2 | Confirmed `/api/auth/logout` contract | ✅ (contract is **not** query-param — this checklist item's wording is stale, see note below) | `curl -X POST /api/auth/logout -H "Authorization: Bearer <token>"` → `200`, clears the cookie (`Max-Age=0`); the same call with no `Authorization` header → `401`. Matches `AuthController.logout()` (`SecurityUtils.extractUserId(authentication)`, no request param at all) and the backlog's BE-2/AUTH-4 delta. |
| 3 | Confirmed no token of any kind is ever written to `localStorage`/`sessionStorage` | ✅ | `grep -rn "localStorage\|sessionStorage" client/src` (excluding tests) → zero matches. Additionally, the live Playwright pass snapshotted both storages after register, after logout, and at the end of the full journey — all empty every time. |
| 4 | BE-1 and BE-2 status checked | ✅ Both shipped, both confirmed still in effect | Re-verified directly against `AuthController.java` source (not just the backlog's dated note): `refreshToken()` reads `@CookieValue(value = "refreshToken", required = false)`; `logout()` takes only `Authentication` — no `userId` param. Both confirmed live via the `curl` pass above. AUTH-3/AUTH-5 are built against the final cookie-based contract, not a temporary fallback — nothing to flag. |
| 5 | AUTH-8's E2E suite passes in CI | ✅ (verified locally as a proxy — see note below) | Ran `pnpm e2e` locally: **29/29 passing**, including both `auth-journey.spec.ts` tests (`Auth journey — register, logout, login` and `Auth journey — expired session, then protected deep link`). Also ran `pnpm test` (124/124 unit tests), `pnpm build` (`tsc -b` clean), `pnpm lint` (clean) as a full sanity pass alongside it. |

## Note on item 5 — CI vs. local proxy

This session has no GitHub CLI / Actions access, so "passes in CI" couldn't be checked by reading an actual `client-ci` run. Per user decision, a local `pnpm e2e` run stands in as the proxy: 29/29 green, same suite `client-ci` runs. **Follow-up for a human with GitHub access:** confirm the latest `client-ci` run on `master` (or the AUTH-8 PR) is green, since local-green is evidence but not identical to CI-green (HF-12/HF-13 precedent: CI's Linux-rendered baselines and environment have caught real issues local Windows runs missed for the visual-regression project — not exercised by this ticket's scope, but the same "local ≠ CI" caveat applies in principle).

## Note on item 2 — stale epic wording

The epic's checklist text ("query param, not body") describes an intermediate contract that predates BE-2 shipping. The backlog's AUTH-4 entry already documents the real, current contract (header-derived, no param of any kind) — this run re-confirms that contract is what's actually live, rather than re-litigating the epic's outdated framing. No delta needed on the backlog entry itself; it already has this correction.

## Test data cleanup

Three throwaway users were created against the local dev Postgres during this pass
(`qa_auth7_<timestamp>@example.com`, `qa_auth7_ui_<timestamp>@example.com`). Left in the
dev database — harmless, dev-only data; no cleanup script exists or is warranted for a local
dev DB.

## Epic closeout

AUTH-0 → AUTH-8, MSW-0: all Phase 5 (auth integration) tickets `DONE`. Cumulative test surface
added in this ticket: 0 new automated tests (QA is a verification pass, not new test code) — a
one-off standalone Playwright script drove the real UI against the real backend and was deleted
after the run (see script inline in this doc's evidence, not committed to the repo). Next: Phase 6
(FEED-0 onward) — de-mocking feed/groups/hashtags/broadcasts/sport switcher against the real
`social`/`sport` backends.
