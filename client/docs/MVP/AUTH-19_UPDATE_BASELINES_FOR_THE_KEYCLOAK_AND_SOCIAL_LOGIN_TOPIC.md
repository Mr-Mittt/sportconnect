# AUTH-19 · Update the visual baselines for the whole Keycloak and social-login topic

**Status:** `DONE` (2026-10-22) · **Type:** Testing · **Depends on:** all client work of the topic pushed (ACCOUNT-7 and AUTH-17 done 2026-10-21; AUTH-17 left the new globe and the new circle sizes in all 81 `auth-theme-*` files, none of which existed yet) · **Gates:** nothing

**Filed:** 2026-10-21, at the ACCOUNT-7 close-out, on the owner's request: the topic (33 commits ahead of master, from AUTH-14 to ACCOUNT-7) left its baselines to the `update-baselines` dispatch and none was ever applied (a Windows host cannot render a valid baseline).

## What

Every client ticket of the topic stated a "Visual-regression expectation" and waited for the GitHub dispatch. This ticket is the one pass that closes them: the owner pushes the branch, runs `client-ci` with `update-baselines=true` (Actions → client-ci → Run workflow), downloads the `visual-baselines` artifact, and Claude applies it with `/updatebaseline`, which classifies every file by SHA-256 and stops when the changed set differs from the expected one.

Expected set, from the tickets' own expectation lines:

| Baselines | Source | Change |
|---|---|---|
| `auth-theme-*` (81 files) | AUTH-15 (57) + AUTH-16 (`register-zone-unavailable`, 3) + A29/A33 (7 `link-account-*` stories, 21) | new: none exists in the repo yet; `register` (en, vi) and `register-with-errors` also render the zone block and name row |
| `account-settings-change-password-{375,768,1280}`, `account-settings-deactivate-{375,768,1280}` | ACCOUNT-6 | changed: the dialogs gained the method radio |
| `account-settings-email-{375,768,1280}` | ACCOUNT-7 (state added by this ticket) | new: the `default` shot never reaches the email row, so a scrolled state is added; `default` stays identical (see Findings) |
| anything else a topic commit changed without saying so (e.g. A36's avatar in the account menu and on comments) | the topic's `git diff master...HEAD -- client/` | to be derived by `/updatebaseline` Phase 3 and shown to the owner before applying |

The 21 AUTH-13 login/register/forgot/reset baselines were already deleted by AUTH-14 and need nothing.

## Acceptance

- The dispatch artifact is applied: exactly the expected files changed or new, every other baseline byte-identical (an unexpected extra stops the run and is reported, not applied).
- The `visual-regression` project of `client-ci` passes against the committed baselines.
- The "baselines pending" notes are replaced by an Executed note (HF-20 style) in the AUTH-15, AUTH-16, ACCOUNT-6 and ACCOUNT-7 summaries, and the clause is dropped from their backlog rows and from `E2E_OVERVIEW.md`.

**Count corrected 2026-10-21 (at pickup):** the built theme Storybook has 25 stories, and `auth-theme.spec.ts` takes each at 375, 768 and 1280 plus `login` and `register` again in Vietnamese: 25 x 3 + 2 x 3 = 81 new files, not 60. The 7 extra stories are the `link-account-*` pages added by A29 and A33 (`confirm`, `email-only`, `wrong-password`, `email-sent`, `email-sent-can-resend`, `unverified`, `email-sent-unverified`), which no earlier count included. The Phase 3 check in `/updatebaseline` uses 81 + 9 changed.

## Findings at the first artifact (2026-10-21) and two spec fixes that ride with this ticket

The first dispatch artifact (240 PNGs) was classified by SHA-256 before anything was applied: 81 new `auth-theme-*` (as counted above), 6 changed (the ACCOUNT-6 dialogs), 150 identical, none missing, and two things that did not match the expectation above:

- **`account-settings-default-*` came back byte-identical.** The shot is of the dialog element, whose content scrolls inside a 72vh box, so it stops in the Contact section and never reaches the email row ACCOUNT-7 added. The ticket's "3 changed" was a wrong expectation. **Fix:** a fourth state in `account-settings.spec.ts`, `account-settings-email-{375,768,1280}` (the Email heading scrolled to the top of the scroll area; checked locally at 1280: email, Verified badge, Change email, password and deactivate sections and the footer in view). The three `default` baselines stay as they are.
- **`post-modal-empty-*` (3 files) changed although no topic commit touches the modal.** The artifact shows a dark browser focus outline round the whole dialog. Cause (proved with probes): nothing inside the empty modal takes focus, so Radix focuses the dialog box itself; since AUTH-14 `seedAuthenticatedSession` goes through full-page redirects, so the final document has had no pointer input, and Chrome treats a script focus in that case as keyboard-style and matches `:focus-visible` (computed outline `auto 1px`). On master the helper typed into the login form and clicked Submit, which left a mouse-focused button behind, so the dialog's focus was not focus-visible (outline `none`). With the post API held back and a real click on an injected button before the dialog opened, the same page gave `focusVisible: false`; without the click, `true`. Not an OS difference and not a code regression: a spec that left the focus state undefined. **Fix:** `app-post-modal.spec.ts`, `empty` test, blurs the active element before the shot, as the other visual specs do (checked locally: no outline). The committed Linux baselines for `post-modal-empty-*` are therefore expected to stay valid. The dialog's default focus ring is left alone (it is the normal keyboard behaviour; hiding it on every modal would be a product ticket of its own).

**Decision (owner): one dispatch.** The artifact above is not applied. After these two spec fixes are pushed, the dispatch is run again and the expected set becomes: **81 new `auth-theme-*` + 3 new `account-settings-email-*` = 84 new, 6 changed (`account-settings-change-password-*`, `account-settings-deactivate-*`), everything else byte-identical, including `account-settings-default-*` and `post-modal-empty-*`** (the latter is the proof that the blur fixes the outline).

## Executed (2026-10-22)

Three dispatches. The first two artifacts were never applied.

- **First artifact:** the two findings above (the `default` shot and the focus ring); spec fixes `account-settings.spec.ts` (new `email row` state) and `app-post-modal.spec.ts` (blur), commit `9c73749`.
- **Second artifact:** 84 new and the 6 expected changed, but `post-modal-empty-1280.png` still carried the dialog's focus ring (375 and 768 came back identical, so the blur worked there; at 1280 something on Linux put the focus state back, not reproducible on the Windows host). Stronger fix, commit `73f4dae`: the `empty` test blurs, clicks an empty spot of the dialog so the focus comes from the pointer (a click alone does nothing while the box is already focused), and polls `:focus-visible` until it is false, so a bad state fails the test and not a screenshot diff. Locally the guard held in 9 runs (3 widths x 3); only the Windows screenshot noise failed.
- **Third artifact (243 PNGs), applied as `160ee0c`:** SHA-256 against the committed set gave **84 new** (81 `auth-theme-*`, 3 `account-settings-email-*`), **6 changed** (`account-settings-change-password-*`, `account-settings-deactivate-*`), **153 identical** and **0 missing**: exactly the expected set, with `account-settings-default-*` and all three `post-modal-empty-*` byte-identical to the committed Linux baselines (the proof that the spec fix holds on Linux, including at 1280).
- **Human check** (one image per surface at 1280): the email row state shows the email, the Verified badge, Change email, Change password, Deactivate account and Save changes; the two dialogs show the method radio; `auth-theme-register` shows the globe, the zone block and the name row; `auth-theme-link-account-confirm` shows the "This email already has an account" page with the password and email options.

Not yet run: the `visual-regression` job of `client-ci` against the committed baselines (the PR run confirms it). The dialog's default focus ring was left alone, as decided.

## Follow-up in this ticket (2026-10-22, owner's request after the first pass)

Two things found while checking the applied baselines, both fixed here in a second commit:

- **A personal email address in the theme stories.** The `link-account-*` stories used a real personal address (`KcPage.stories.tsx` 4 times, `KcPageStory.tsx` 2), so it sat in the Storybook and in the committed baseline images. Replaced by `jordan@example.com` (the address the client's mock user already uses). The address is shorter, so the text of those pages re-wraps: the **21 `auth-theme-link-account-*` baselines** (7 stories x 3 widths) differ from the ones applied in `160ee0c`, and the `visual-regression` job fails on them until one more dispatch is applied. Expected set for that dispatch: exactly those 21 changed, the other 222 byte-identical.
- **The register Tab test had been failing since A27** (`auth-theme-a11y.spec.ts`, "register: every field and the submit button are reachable by Tab"): it required Tab to reach `#username`, which the registration page has not shown since A27 (the flow fills it on the server). Fix: `username` is no longer in the list of reachable fields, and the test now asserts that no Tab stop is a username. Proven: the test passes against the built theme Storybook; putting `username` back in the list makes it fail with "Tab should reach #username". The new "no username" assertion has no mutation check (the story has no username field to make focusable).

The theme Storybook was not rebuilt locally; the new email was checked in the next dispatch's artifact instead.

**Executed (2026-10-22):** the fourth artifact (243 PNGs) was classified by SHA-256: exactly the **21 `auth-theme-link-account-*` files changed**, the other **222 byte-identical**, 0 new, 0 missing, as predicted. Applied as `ac05318`. Human check of `auth-theme-link-account-confirm-1280` and `-email-sent-unverified-375`: both show `jordan@example.com`, the text re-wrapped, nothing else moved. Not yet run: the `visual-regression` job of `client-ci` against the committed baselines (the PR run confirms it).

**CI type-check failure (2026-10-22, `013ab59`).** The PR's `tsc -b` reported five errors in four e2e specs: `client/tsconfig.node.json` has `lib: ["ES2023"]` and no DOM lib, so a Playwright `evaluate` callback cannot use element members or `getComputedStyle`. Two were AUTH-19's (the email-row scroll, the focus-visible guard), two were older (`redirect.spec.ts`, the A35 side fix; `auth-theme-a11y.spec.ts`, the AUTH-16 follow-up), all fixed on this branch by owner decision, so the earlier PRs of the chain may fail `tsc -b` until the chain reaches this branch. Lesson: running a spec with Playwright does not type-check it, so run `npx tsc -b` before pushing e2e changes. A string holding a bare function (`"(el) => ..."`) type-checks but returns `undefined` at run time (it is evaluated as an expression), so the fix uses hand-typed callbacks and IIFE expressions; the focus guard was mutation-checked again afterwards (expecting `true` fails with `Received: false`).

## Out of scope

Fixing a real visual regression the dispatch reveals (that is a ticket of its own); replacing the watermarked `earth.png` (AUTH-17; if AUTH-17 lands first its own dispatch covers the theme baselines and this ticket only has to cover the rest, and its "57" is 60 now); the removed AUTH-13 baselines.

**Tests:** none to write. The proof is the SHA-256 classification and a green `visual-regression` job.
