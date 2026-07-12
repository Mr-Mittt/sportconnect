# AUTH-6 · Auth hardening

**Status:** DONE (2026-07-12) · **Type:** Hardening · **Dependency:** AUTH-1, AUTH-2 · **Spec:** AUTH/FEED epic § AUTH-6

## What this ticket does

Per the epic, AUTH-6 originally bundled three things: rate-limit error surfacing, full
keyboard navigation + screen-reader labeling on Login/Register, and a password show/hide
toggle. Two of those were already resolved before this ticket started:

- **Show/hide toggle** shipped early in AUTH-1 (pulled forward — the mockup made it core
  to the form).
- **Rate-limit error surfacing** was re-scoped out during Phase 1 of this ticket (see
  "Scope decision" below) — nothing to build against a backend contract that doesn't
  exist.

What this ticket actually built: **the a11y hardening** — a committed axe scan gate and
explicit keyboard-navigation coverage for Login and Register, extending HF-8's existing
pattern rather than forking a new one.

## Scope decision: rate-limit error surfacing split out

The epic's own AUTH-6 text flagged this as unverified: *"confirm the actual error shape
when this ticket is picked up, since it wasn't visible in the controller code reviewed
here."* Verified on 2026-07-12 with a repo-wide search: **no rate-limiting exists at all**
server-side — no filter/interceptor/aspect, no `bucket4j`/`resilience4j` dependency, no
rate-limit config anywhere. `modules/auth/docs/AUTHENTICATION_DESIGN.md` documents the
intended policy (5 login attempts/15min, 3 registrations/hour, 3 password
resets/hour/email) but `README_AUTH_SETUP.md` explicitly lists it under "TODO / Future
Enhancements". There's no error shape to surface because the backend never returns one.

User decision: rather than build speculative client code against a made-up 429 response
shape, filed backend ticket **A5** (`modules/auth/docs/BACKLOG_MVP.md`) to implement real
rate limiting first (Redis-backed counter, since Redis is already wired into the app).
The client-side error-surfacing work becomes a new ticket once A5 ships and the real
response contract is known — not folded back into AUTH-6, which closes out with only its
a11y scope. `client/docs/BACKLOG_MVP.md`'s "Backend blockers" table tracks this the same
way it already tracked BE-1/BE-2 before they shipped.

## What was built

**`e2e/flows/a11y.spec.ts`** extended (not forked — per HF-8's own delta note: "New pages
should extend it, not fork it"):
- Axe scan + no-horizontal-overflow checks for `/login` and `/register` at the same three
  breakpoints (375/768/1280px) HF-8 established for Home Feed. Both routes sit outside
  `ProtectedRoute`, so no `seedAuthenticatedSession()` — MSW's default `/auth/refresh`
  handler already 401s without a cookie, which is the normal logged-out state these pages
  render against.
- Explicit keyboard-navigation tests (`/login: Tab reaches every control in order`,
  `/register: Tab reaches every control in order`) — axe checks accessible name/role/value
  and contrast, but not tab order, so this walks `Tab` through every real control and
  asserts the sequence directly (email → password → show/hide toggle → [full name → phone,
  register only] → submit → the login/register cross-link). Disabled OAuth buttons are
  correctly skipped by native `disabled` semantics, no special-casing needed.

**Real bug found and fixed**: the first axe run failed with a `serious color-contrast`
violation on both forms' submit button — white text on `--color-border-accent`'s `#378add`
measures 3.59:1, failing WCAG AA's 4.5:1 minimum. Traced to the source: **the mockup itself**
(`design-reference-login.html`) has this exact color baked into its inline style
(`background: rgb(55, 138, 221)`) — this isn't an implementation drift from the design, the
design itself violates its own accessibility baseline. Same class of bug HF-8 found and
fixed for `--color-text-muted`. Fixed the same way:
- Added `--color-accent-solid: #185fa5` to `index.css` (same hex as `--color-text-accent`,
  which already passes AA as a background — 6.53:1 with white text).
- `Button`'s `primary` variant now uses `bg-accent-solid` instead of `bg-border-accent`.
- `design-reference-login.html`'s submit button inline style updated to
  `rgb(24, 95, 165)` to match, with a comment so a future contributor doesn't "restore" the
  original mockup value.
- No visual-regression baselines exist for Login/Register (only Home Feed has HF-10a/b's
  harness), so there was nothing to regenerate — confirmed by checking `e2e/visual/` before
  concluding this.

## Key decisions

- **Extend `a11y.spec.ts`, don't create a second file** — HF-8's own delta explicitly
  called for this, and the existing `gatingViolations()` helper (critical/serious filter)
  is reused as-is.
- **Keyboard-nav coverage is a dedicated Playwright test, not left to axe** — axe doesn't
  exercise interaction, so "full keyboard navigation" needed its own assertion of the
  actual Tab sequence, not just a static accessibility-tree check.
- **Fixed the contrast bug rather than just documenting it as a known issue** — WCAG AA is
  a stated baseline in `client/CLAUDE.md` ("Contrast on every token combination meets WCAG
  AA"), and the fix was small and contained (one new token, no component API change).

## Non-obvious constraints

- `page.getByLabel('Password')` in Playwright does **substring** matching by default —
  `"Password"` matches the show/hide toggle's `aria-label="Show password"` too, causing a
  strict-mode violation. Any future test asserting focus/visibility on the password field
  specifically needs `{ exact: true }`.
- `--color-accent-solid` and `--color-text-accent` are deliberately the same hex today but
  are separate tokens — they represent different roles (solid fill vs. text color) that
  happen to share a value now. Don't collapse them into one token; a future redesign could
  legitimately want them to diverge.

## Verification

- **Unit:** 124/124 client-wide tests pass (unchanged — no unit-level code touched).
  `tsc -b` clean. `pnpm lint` clean.
- **E2e:** 27/27 tests pass across the full `e2e` project, including all 21 in the extended
  `a11y.spec.ts` (Home Feed's existing 8 + 13 new for Login/Register) and the pre-existing
  MSW/smoke/journey specs (no regression from the button token change — `primary` variant
  is only used by these two forms, verified via `grep`).
- **Visual:** screenshotted `/login` after the fix — the darker CTA still reads clearly as
  the primary action against the rest of the palette; no visual regression harness exists
  for this page to run formally.
