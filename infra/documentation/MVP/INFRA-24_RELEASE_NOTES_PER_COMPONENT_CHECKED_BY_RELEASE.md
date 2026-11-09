# INFRA-24 · Release notes per component, checked and cleaned by `/release`

**Status:** `IN PROGRESS`
**Type:** Infrastructure (release process)
**Depends on:** none (INFRA-4, INFRA-5, INFRA-8, INFRA-19 and INFRA-6 exist; this adds to them)
**Filed:** 2026-11-09, from the `/feature` session "Move roles to Keycloak" (see A37): production is live and a release has no written record of what it changes, what the owner must run on the box and in what order. The owner asked for a release-note document per image (server, client, chat, box) and for `/release` to check and clean it before releasing.

Each of the four images gets a release-note file in `documentation/release-notes/` (`SERVER.md`, `CLIENT.md`, `CHAT.md`, `BOX.md`), outside the component paths so editing one never triggers an image workflow. Each ticket adds its lines under `## Unreleased` in its own PR (subsections: Changes, Applied automatically, Manual actions on the box, Rollback, Depends on). `/release` checks the file of every selected component (not empty, no placeholder, explicit manual actions and rollback statement, ticket ids of the commits since the last tag present), cleans it (dedupe, drop empty subsections, `Unreleased` becomes `## X.Y.Z — date`, a fresh template is written), puts it in the release commit and builds the release PR description from it, grouped per component into what changes, what is applied automatically and what needs a manual action on the box (a prefilled PR link, since `gh` is not installed). The mechanics live in `infra/scripts/release-notes.sh` (`check-unreleased`, `check-released`, `cut`, `section`, `pr-body`) so they are testable and CI can use them.

Also: the four `*-version.sh check` commands (already run by the image workflows) fail when the current non-`0.0.0` version has no `## X.Y.Z` section; `promote-check.sh` prints the notes of the version being promoted in the summary the reviewer reads; the deployment guide § 15 and the root `CLAUDE.md` describe the rule; `/workon` and `/implement` remind to write the lines.

**Entry point:** the developer (writes lines per ticket), `/release` (check and clean), CI (`check`), the reviewer of a promote (reads the summary).

**Edge cases:** a component with nothing to say (`Unreleased` empty) stops the release rather than shipping a blank entry; the baseline sections for the existing tags only say "released before release notes existed" (no invented history); a release of several components prints the order from `Depends on`.

**Out of scope:** generating notes from commits, publishing them as GitHub Releases, notifying anyone, changing which images exist.

**Tests:** `infra/scripts/test-release-notes.sh` (placeholder, empty and missing cases, `cut` output, `section`, the `check` integration); a run of `/release` on a scratch branch with a deliberately bad file.

**Verified only on GitHub after merge:** the promote summary showing the notes (like the other registry-dependent steps of INFRA-15).
