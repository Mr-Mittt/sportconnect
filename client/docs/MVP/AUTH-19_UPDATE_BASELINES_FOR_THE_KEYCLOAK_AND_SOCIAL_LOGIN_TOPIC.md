# AUTH-19 · Update the visual baselines for the whole Keycloak and social-login topic

**Status:** `TODO` · **Type:** Testing · **Depends on:** all client work of the topic pushed (ACCOUNT-7 done 2026-10-21); best after AUTH-17 · **Gates:** nothing

**Filed:** 2026-10-21, at the ACCOUNT-7 close-out, on the owner's request: the topic (33 commits ahead of master, from AUTH-14 to ACCOUNT-7) left its baselines to the `update-baselines` dispatch and none was ever applied (a Windows host cannot render a valid baseline).

## What

Every client ticket of the topic stated a "Visual-regression expectation" and waited for the GitHub dispatch. This ticket is the one pass that closes them: the owner pushes the branch, runs `client-ci` with `update-baselines=true` (Actions → client-ci → Run workflow), downloads the `visual-baselines` artifact, and Claude applies it with `/updatebaseline`, which classifies every file by SHA-256 and stops when the changed set differs from the expected one.

Expected set, from the tickets' own expectation lines:

| Baselines | Source | Change |
|---|---|---|
| `auth-theme-*` (60 files) | AUTH-15 (57) + AUTH-16 (`register-zone-unavailable`, 3) | new: none exists in the repo yet; `register` (en, vi) and `register-with-errors` also render the zone block and name row |
| `account-settings-change-password-{375,768,1280}`, `account-settings-deactivate-{375,768,1280}` | ACCOUNT-6 | changed: the dialogs gained the method radio |
| `account-settings-default-{375,768,1280}` | ACCOUNT-7 | changed: the modal gained the email row |
| anything else a topic commit changed without saying so (e.g. A36's avatar in the account menu and on comments) | the topic's `git diff master...HEAD -- client/` | to be derived by `/updatebaseline` Phase 3 and shown to the owner before applying |

The 21 AUTH-13 login/register/forgot/reset baselines were already deleted by AUTH-14 and need nothing.

## Acceptance

- The dispatch artifact is applied: exactly the expected files changed or new, every other baseline byte-identical (an unexpected extra stops the run and is reported, not applied).
- The `visual-regression` project of `client-ci` passes against the committed baselines.
- The "baselines pending" notes are replaced by an Executed note (HF-20 style) in the AUTH-15, AUTH-16, ACCOUNT-6 and ACCOUNT-7 summaries, and the clause is dropped from their backlog rows and from `E2E_OVERVIEW.md`.

## Out of scope

Fixing a real visual regression the dispatch reveals (that is a ticket of its own); replacing the watermarked `earth.png` (AUTH-17; if AUTH-17 lands first its own dispatch covers the theme baselines and this ticket only has to cover the rest, and its "57" is 60 now); the removed AUTH-13 baselines.

**Tests:** none to write. The proof is the SHA-256 classification and a green `visual-regression` job.
