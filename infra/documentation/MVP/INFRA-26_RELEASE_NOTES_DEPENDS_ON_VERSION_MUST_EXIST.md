# INFRA-26 · Release notes: a `Depends on` version must exist

**Status:** `TODO`
**Type:** Infrastructure (release process)
**Depends on:** INFRA-24 (the notes, `release-notes.sh`)
**Filed:** 2026-11-09, at the close of INFRA-24: a gap its first server release showed.

The server notes said `box >= 0.1.4`; the box release carrying the change is `0.2.0` and `0.1.4` was never released. `release-notes.sh check-unreleased` only checks the format (`- none` or `- <component> >= X.Y.Z`), so the stop came from `/release`'s judgement step (a person reading the block), not from a command. Make it mechanical: the named version must exist as a tag (`<comp>-v<X.Y.Z>`) or be the version being released in the same run, and the failure message names the highest existing tag.

**Edge cases:** a `Depends on` on a component released in the same run (`/release server client` with `client >= ...`); a tag that exists only locally (`git fetch --tags` refused for a stale local tag once: use the remote's tags, `git ls-remote --tags origin`).

**Out of scope:** generating notes from commits, anything about what the notes say, the CI enforcement of the version check (known unchecked, see INFRA-24).

**Tests:** extend `infra/scripts/test-release-notes.sh` with the missing-version case and its message (mutation-checked: with the check removed, the case fails).
