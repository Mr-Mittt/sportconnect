You are cutting a release: raising the version of one or more components, committing the bump on a new branch and pushing it, so that merging the PR releases. Arguments:
$ARGUMENTS (format: `[component] [minor|patch|major|X.Y.Z]`, both optional — e.g. "", "patch", "server", "server patch", "server 1.0.0").

This is the whole flow of `infra/documentation/PRODUCTION_DEPLOYMENT_GUIDE.md` § 15, done for the user, including the release notes of each component (Step 3b, INFRA-24): no notes, no release. Invoking `/release` **is** the request to commit and push the bump branch, so there is no confirmation gate. It never merges, never touches `master`, and never creates a tag: the PR is merged by the user, and `.github/workflows/server-image.yml` / `client-image.yml` / `chat-image.yml` release and tag on that merge.

## Components

| Component | Version tool | Tag prefix | State |
|---|---|---|---|
| `server` | `infra/scripts/server-version.sh bump <arg>` (edits the root `gradle.properties`) | `server-v` | versioned (INFRA-4) |
| `client` | `infra/scripts/client-version.sh bump <arg>` (edits `client/package.json`) | `client-v` | versioned (INFRA-5) |
| `chat` | `infra/scripts/chat-version.sh bump <arg>` (edits `services/chat/VERSION`) | `chat-v` | versioned (INFRA-8) |
| `box` | `infra/scripts/box-version.sh bump <arg>` (edits `infra/box/BOX_VERSION`) | `box-v` | versioned (INFRA-19); **never part of "all"**: name it, because it only changes when a box file does |

All three components are versioned. A component added later gets a row here and nothing else in this command changes.

---

## Step 1 — Parse the arguments

- The first word, if it is a component name (`server`, `client`, `chat`, `box`, or `all`), selects the component(s); otherwise the selection is **all components**.
- The remaining word (or the only word) is the bump: `minor` (the default when nothing is given), `patch`, `major`, or an explicit `X.Y.Z`. Anything else: stop and show the format.
- **No component given (= all):** release every component whose State is *versioned*, and say in one line which were skipped as not versioned yet. Today that is the server, the client and the chat service (all three); **the box config image is never included** (release it with `/release box`, only when a box file changed).
- **A component named explicitly that is not versioned yet:** stop and say so (INFRA-5 / INFRA-8), changing nothing.
- **An explicit `X.Y.Z` with more than one component selected:** stop — a version number belongs to one component; ask for `/release <component> X.Y.Z`.

## Step 2 — Preconditions (stop and report; never work around)

1. `git branch --show-current`. It must be `master`. If it is any other branch: **stop and ask the user which branch to use** (CLAUDE.md § Git Workflow) — do not assume, do not switch silently.
2. `git status --porcelain` must show no modified or staged **tracked** file (untracked scratch files are normal here and are never staged). If a tracked file is dirty, stop and list it: the release commit must contain the version bump only.
3. `git fetch origin --prune`, then `git merge --ff-only origin/master`. If it refuses, local `master` has commits of its own — report it, do not force.

## Step 3 — Bump

For each selected component run its version tool with the bump from Step 1 (no bump given → `minor`). Read the tool's output line (`<component> version: A -> B`). The tool validates (valid `X.Y.Z`, strictly higher than the current version and than the highest existing release tag, so a repeat or a downgrade fails). If it fails, show its message and stop; nothing has been committed, and if a file was already edited by an earlier component in this run, restore it with `git checkout -- <that file>`.

## Step 3b — Release notes: check, then clean (INFRA-24)

Every selected component has a notes file, `documentation/release-notes/<COMPONENT>.md` (`SERVER.md`, `CLIENT.md`, `CHAT.md`, `BOX.md`; format and rules in `documentation/release-notes/README.md`). The version is known now, so do this for each selected component **before** Step 4. If anything below stops the release, restore what Step 3 and this step already edited (`git checkout -- <file>`) and report; nothing has been committed.

1. **Mechanical check.** `infra/scripts/release-notes.sh check-unreleased <component>`. It stops on: a missing file, an empty `### Changes`, an empty `### Manual actions on the box` or `### Rollback` (a bare `- none` is an explicit answer; `### Applied automatically` is optional), any `TBD`, `TODO`, `XXX`, `FIXME` or `<angle brackets>`, a `Depends on` line that is not `- none` or `- <component> >= X.Y.Z`. Show its messages and stop; do not fix the content for the user.
2. **Judgement check** (you read the block; the script cannot):
   - Is every `Manual actions on the box` line concrete: who runs what, where (a command, a script name, a console step)? "update the realm" is not; `box: apply-realm-production.sh apply` is. Stop and ask for the missing detail.
   - Does `Rollback` say whether the previous release still works? A migration with no answer stops the release.
   - Does a `Depends on` version exist yet (`git tag -l '<comp>-v*'`, or the version being released in this same run)? A dependency on a version that is neither released nor in this run stops the release.
3. **Cross-check with the commits.** `git log <comp>-v<last>..HEAD --format=%s -- <the component's paths>` (server: `server modules gradle build.gradle settings.gradle gradle.properties`; client: `client`; chat: `services/chat`; box: `infra/box infra/oracle infra/keycloak infra/keycloak-extensions infra/docker-compose.dev.yml infra/rabbitmq infra/scripts/create-keycloak-db.sh infra/scripts/init-chat-db.sql`; skip `chore(release)` commits). List every ticket id in those subjects that appears nowhere in the notes and **ask** whether it needs a line or is invisible to users and the owner. Never write an entry yourself from a commit message.
4. **Clean and cut.** `infra/scripts/release-notes.sh cut <component> <X.Y.Z>` (today's date): drops empty subsections and an `Applied automatically` or `Depends on` that only says `- none`, removes duplicate lines, renames `## Unreleased` to `## X.Y.Z — <date>` and writes a fresh empty template above it. Read the result once and tidy wording or order only if something is plainly wrong; do not add facts.
5. **No notes, no release.** A component with nothing to say stops the run (ask whether to drop it from this release), rather than shipping an empty section.

With more than one component, also work out the **release order** for Step 5: a component comes after every component named in its `Depends on` (default when nothing says otherwise: box, server, chat, client).

---

## Step 4 — Branch, commit, push

1. Branch: `git switch -c chore/release-<component>-<X.Y.Z>` (several components: `chore/release-<comp1>-<ver1>-<comp2>-<ver2>`).
2. Stage the changed version files **and the cut release-notes file** **by name** (`gradle.properties` + `documentation/release-notes/SERVER.md` for the server, `client/package.json` + `CLIENT.md`, `services/chat/VERSION` + `CHAT.md`, `infra/box/BOX_VERSION` + `BOX.md`) — never `git add -A`. The release commit holds the version bump and the notes, nothing else.
3. Commit: `chore(release): <component> <X.Y.Z>` (several: `chore(release): server 0.2.0, client 0.1.0`), ending with the `Co-Authored-By` attribution line given in the session's attribution reminder.
4. `git push -u origin <branch>`.

## Step 5 — Report

- Component(s), old → new version, the branch, the commit SHA.
- **What the owner must run (INFRA-24):** for each component, its `
- **The PR description (INFRA-24).** Build it from the sections just committed: `infra/scripts/release-notes.sh pr-body <comp>:<X.Y.Z> ...`, components in the release order from Step 3b (a single component: just that one). It is grouped per component into what changes, what is applied automatically and what needs a manual action on the box, with a marker on a block that has a manual action. Add this as the last line, after a blank line: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Show the whole description to the user in a fenced block.
- The PR link: take `git remote get-url origin`, strip `.git`, and give the **prefilled** compare link `<repo-url>/compare/master...<branch>?quick_pull=1&title=<encoded title>&body=<encoded body>`, where the title is the commit subject and both are percent-encoded (`node -p "encodeURIComponent(require('fs').readFileSync(0,'utf8'))"`, the text on stdin). If the finished link is longer than about 7000 characters, give the plain `<repo-url>/pull/new/<branch>` link instead and say the user pastes the description from the block above. Say the user opens and merges the PR (`gh` is not installed).
- What merging does: for the server, `server-image` finds no tag `server-vX.Y.Z`, pushes `:X.Y.Z` and `:latest`, then creates the tag; for the client, `client-image` does the same with `client-vX.Y.Z` and `sportconnect-client`.
- Reminders: merge only when `server-ci` (and `client-ci` for a client bump) is green for the PR (a release is not gated on it); afterwards check the run's Summary says `release: true` and that the tag appears under the repo's Tags; the first real runs of both pipelines are tracked in INFRA-15, record the result there.
- Leave the working tree on the release branch; after the user says it is merged, the CLAUDE.md "merged" cleanup applies (verify the commit is in `origin/master`, fast-forward, `git branch -d`).
