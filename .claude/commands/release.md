You are cutting a release: raising the version of one or more components, committing the bump on a new branch and pushing it, so that merging the PR releases. Arguments:
$ARGUMENTS (format: `[component] [minor|patch|major|X.Y.Z]`, both optional — e.g. "", "patch", "server", "server patch", "server 1.0.0").

This is the whole flow of `infra/documentation/PRODUCTION_DEPLOYMENT_GUIDE.md` § 15, done for the user. Invoking `/release` **is** the request to commit and push the bump branch, so there is no confirmation gate. It never merges, never touches `master`, and never creates a tag: the PR is merged by the user, and `.github/workflows/server-image.yml` / `client-image.yml` release and tag on that merge.

## Components

| Component | Version tool | Tag prefix | State |
|---|---|---|---|
| `server` | `infra/scripts/server-version.sh bump <arg>` (edits the root `gradle.properties`) | `server-v` | versioned (INFRA-4) |
| `client` | `infra/scripts/client-version.sh bump <arg>` (edits `client/package.json`) | `client-v` | versioned (INFRA-5) |
| `chat` | — | `chat-v` | **not versioned yet** (INFRA-8) |

When INFRA-8 lands, add the chat service's tool and file to this table (its ticket says so) — nothing else in this command changes.

---

## Step 1 — Parse the arguments

- The first word, if it is a component name (`server`, `client`, `chat`, or `all`), selects the component(s); otherwise the selection is **all components**.
- The remaining word (or the only word) is the bump: `minor` (the default when nothing is given), `patch`, `major`, or an explicit `X.Y.Z`. Anything else: stop and show the format.
- **No component given (= all):** release every component whose State is *versioned*, and say in one line which were skipped as not versioned yet. Today that is the server and the client (chat is skipped).
- **A component named explicitly that is not versioned yet:** stop and say so (INFRA-5 / INFRA-8), changing nothing.
- **An explicit `X.Y.Z` with more than one component selected:** stop — a version number belongs to one component; ask for `/release <component> X.Y.Z`.

## Step 2 — Preconditions (stop and report; never work around)

1. `git branch --show-current`. It must be `master`. If it is any other branch: **stop and ask the user which branch to use** (CLAUDE.md § Git Workflow) — do not assume, do not switch silently.
2. `git status --porcelain` must show no modified or staged **tracked** file (untracked scratch files are normal here and are never staged). If a tracked file is dirty, stop and list it: the release commit must contain the version bump only.
3. `git fetch origin --prune`, then `git merge --ff-only origin/master`. If it refuses, local `master` has commits of its own — report it, do not force.

## Step 3 — Bump

For each selected component run its version tool with the bump from Step 1 (no bump given → `minor`). Read the tool's output line (`<component> version: A -> B`). The tool validates (valid `X.Y.Z`, strictly higher than the current version and than the highest existing release tag, so a repeat or a downgrade fails). If it fails, show its message and stop; nothing has been committed, and if a file was already edited by an earlier component in this run, restore it with `git checkout -- <that file>`.

## Step 4 — Branch, commit, push

1. Branch: `git switch -c chore/release-<component>-<X.Y.Z>` (several components: `chore/release-<comp1>-<ver1>-<comp2>-<ver2>`).
2. Stage the changed version files **by name** (`gradle.properties` for the server, `client/package.json` for the client) — never `git add -A`.
3. Commit: `chore(release): <component> <X.Y.Z>` (several: `chore(release): server 0.2.0, client 0.1.0`), ending with the `Co-Authored-By` attribution line given in the session's attribution reminder.
4. `git push -u origin <branch>`.

## Step 5 — Report

- Component(s), old → new version, the branch, the commit SHA.
- The PR link: take `git remote get-url origin`, strip `.git`, and give `<repo-url>/pull/new/<branch>`. Say the user opens and merges the PR (`gh` is not installed).
- What merging does: for the server, `server-image` finds no tag `server-vX.Y.Z`, pushes `:X.Y.Z` and `:latest`, then creates the tag; for the client, `client-image` does the same with `client-vX.Y.Z` and `sportconnect-client`.
- Reminders: merge only when `server-ci` (and `client-ci` for a client bump) is green for the PR (a release is not gated on it); afterwards check the run's Summary says `release: true` and that the tag appears under the repo's Tags; the first real runs of both pipelines are tracked in INFRA-15, record the result there.
- Leave the working tree on the release branch; after the user says it is merged, the CLAUDE.md "merged" cleanup applies (verify the commit is in `origin/master`, fast-forward, `git branch -d`).
