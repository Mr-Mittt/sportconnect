# INFRA-8 · `services/chat` Dockerfile publish workflow

**Status:** `DONE (2026-10-29; GitHub-side checks are INFRA-15)` · **Type:** Infrastructure (CI, artifact-scoped) · **Dependency:** INFRA-3 ·
**Spec:** mirrors INFRA-4's shape, for `services/chat` instead of `server`

**Origin:** `services/chat/Dockerfile` already exists (multi-stage Go build → distroless runtime,
see `services/chat/CLAUDE.md`) but nothing builds or publishes it — there's no CI workflow for this
module at all yet, unlike `server-ci.yml` (INFRA-1).

**Delta 2026-10-26 (found during INFRA-12):** the Dockerfile above **does not build**. It starts from
`golang:1.22-alpine`, but `services/chat/go.mod` requires `go 1.25.0`, so `go mod download` fails with
`go.mod requires go >= 1.25.0 (running go 1.22.12)`. This ticket must bump the base image (and keep it
tied to `go.mod`, e.g. build it in CI so a toolchain bump can't drift again); INFRA-12 measured the stack
with `golang:1.25-alpine` instead. Also note for whoever runs the image: with the server's `dev` profile
the shared secret is the committed dev value, not the `INTERNAL_SERVICE_SECRET` env var, so a container
started with its own secret gets 403 on `/internal/sync/**`.

**What ships:**
- A CI workflow (new `chat-ci.yml`, or a job appended to an existing one — decide in Phase 1)
  triggered on changes under `services/chat/**`: `go build ./...`, `go vet ./...`, `go test ./...`
  (mirrors INFRA-1's server-CI shape, Go-flavored).
- A publish step (extending that workflow or a separate one, matching INFRA-4's split) that builds
  `services/chat/Dockerfile` and pushes to `ghcr.io/<org>/sportconnect-chat` on merge to `master`,
  tagged with the commit SHA.
- Done when: a real image is pushed to GHCR and can be pulled + run locally against the dev compose
  stack's Postgres/Redis to confirm it boots (same bar INFRA-4 already holds itself to).

## Delta 2026-10-28 (INFRA-4): versioning scheme to reuse, not just the commit SHA

Do not stop at "tagged with the commit SHA". INFRA-4 built a scheme for the server image and the chat image follows it (`.github/workflows/server-image.yml` and `infra/scripts/server-image-plan.sh`, `server-version.sh`, `prune-ghcr-versions.sh` are the templates): the chat service has its own version, separate from the monolith's, tags `chat-vX.Y.Z`; a release is a merged PR that raised the version with a bump tool (the workflow releases when the tag for the file's version does not exist yet, `0.0.0` is never released); an ordinary master merge pushes `:sha-<short>` and `:edge`, stamped `<version>+<short sha>`; retention keeps every release plus the newest 10 `sha-*` builds. Stamp the version into the binary at build time (`-ldflags -X`) and label the image like the server's (`org.opencontainers.image.version` and `.revision`). The scripts hard-code `server-v` and `sportconnect-server`; parameterize them when the second user arrives rather than copying them. Register chat in the component table of `.claude/commands/release.md` (its version tool and file), so `/release` bumps it too.

## Decisions 2026-10-29 (Phase 1 answers)

- **Version file:** `services/chat/VERSION` (one line `X.Y.Z`, `0.0.0` placeholder), edited by a chat bump tool; stamped into the binary with `-ldflags -X`.
- **Scripts:** copy, as INFRA-5 did: `chat-version.sh` and `chat-image-plan.sh` beside the server and client ones (the retention script stays shared). Parameterising all three is not done here.
- **Go base image:** the workflow reads the `go` line of `services/chat/go.mod` and passes it as the `GO_VERSION` build arg (the Dockerfile keeps a working default, `ARG GO_VERSION=1.25`), so a Go bump in `go.mod` reaches the image without a Dockerfile edit.
- **Final image:** stays `distroless/static-debian12`, switched to the `:nonroot` tag with an explicit `USER nonroot` (UID 65532; Phase 2 confirms the service writes no files). No in-image `HEALTHCHECK` (no shell); health is probed from outside by INFRA-6.
- **Out of scope:** the server's `dev` profile ignoring `INTERNAL_SERVICE_SECRET` (the box runs `prod`, which honours it; documented in the chat env notes only); distroless for the server and client (INFRA-16).
- **GitHub-side checks** (first push, release, tag, retention, package visibility, pull and run) go into INFRA-15 as a chat section, not a new ticket.

## Implementation summary (2026-10-29)

**Design (approved plan, restated).** The chat service gets its own image, version and release path with the same rules as the server and the client: `ghcr.io/mr-mittt/sportconnect-chat`; a merged PR that raises `services/chat/VERSION` releases `X.Y.Z`, `latest`, `edge` and `sha-<short>` and creates the tag `chat-vX.Y.Z` last (`0.0.0` is never released); an ordinary master merge pushes `sha-<short>` and `edge`; a pull request builds without pushing; retention keeps every release, `latest`, `edge` and the newest 10 `sha-*`. The CI half of the ticket already existed (`chat-ci.yml`, CHAT-5), so what was built is the image.

**Built.**
- `services/chat/Dockerfile`: `ARG GO_VERSION=1.25` / `FROM golang:${GO_VERSION}-alpine` (it was `golang:1.22`, which cannot build `go 1.25.0`); builds with `-trimpath -ldflags "-s -w -X main.version=${VERSION}"` and cache mounts; final stage `distroless/static-debian12:nonroot` with `USER nonroot` (UID 65532), `EXPOSE 8090`, OCI labels (title, description, source, version, revision, created). No `HEALTHCHECK` (no shell); `GET /healthz` is probed from outside by INFRA-6.
- `services/chat/.dockerignore` (`.git`, `docs`, `*.md`, `migrations`), `services/chat/VERSION` (`0.0.0`).
- `services/chat/cmd/chat/main.go`: `var version = "dev"` set by the build, and `version` added to the "chat service listening" log line. The only Go change.
- `infra/scripts/chat-version.sh` (`bump [minor|patch|major|X.Y.Z]`, `check`; reads the first line of `VERSION`, keeps its line endings) and `infra/scripts/chat-image-plan.sh`: copies of the client scripts, as decided (the retention script stays shared).
- `.github/workflows/chat-image.yml`: the client workflow with its own paths (`services/chat/**` minus docs, the two scripts, the workflow), package, tag prefix and cache scope; a "Go version from go.mod" step turns `go 1.25.0` into `GO_VERSION=1.25` for the build.
- `/release` knows chat (its row, the "all components" rule and the staged file); a bare `/release` now bumps the server, the client and chat together.
- `infra/oracle/scripts/run-containers.sh`: a stale comment about the Go tag corrected (its sed now matches nothing and is harmless).
- Docs: INFRA-15 gained a chat section (CH1 to CH9), INFRA-6's Delta the chat image contract (and the migrations question), the layout doc and `PRODUCTION_DEPLOYMENT_GUIDE.md` section 15 a chat paragraph and a change-history row, `PROGRESS.md` a line, `services/chat/CLAUDE.md` a note on the image. `PORTS.md` needs nothing: 8090 is listed for the process and the container.

**Divergences from the plan.** None in design. Small additions: the image carries its own `description` label (so it does not repeat the server image's inherited Ubuntu text), and `.dockerignore` also excludes `migrations` (not needed by `go build`; the image does not apply them, see INFRA-6).

**Verified locally.**
- Both scripts in a scratch repo: bump (default, patch, major, explicit, repeat, lower, bad argument, bad file, below and above the highest tag by version order), CRLF and LF `VERSION` files keep their endings, `check` (placeholder, untagged, tagged, below the latest tag, missing file) with real exit codes 1, 1 and 0, and the plan for a pull request, a placeholder push, an untagged release, a dispatch re-run, a CRLF file, a tagged ordinary build, a bump in a PR, and refusal off `master` and for a tag ref.
- `actionlint` on `chat-image.yml`: clean.
- `go build ./...` and `go vet ./...` from `services/chat`: clean; a build with `-X main.version=` links. `go test` was not run: the change touches no tested code and the database-backed tests are `chat-ci`'s job.
- Real image builds, once with `GO_VERSION` read from `go.mod` (1.25) and once with the default: 5.2 MB, `User=nonroot`, entrypoint `/chat`, port 8090, correct labels. The version arrives in the log line (`version":"0.0.0-local"`, not `dev`).
- Boot: the chat image together with the released server image (`0.1.0`) on the dev Compose network, with throwaway databases, the four chat migrations applied, and a throwaway Redis (so the dev sync stream was not consumed). The cold-start bootstrap against the server succeeded, "chat service listening" logged, `/healthz` returned 200, the process ran as UID 65532, and an API call without a token and with a bad token both returned 401. Everything was removed afterwards; the dev stack was left running.

**Conditional (GitHub only), tracked in INFRA-15 (CH1 to CH9):** the merge and PR runs, the path filter, the first release and tag, the re-run and master-only refusal, retention, package visibility and link, the pull of the pushed image, and the "Go version from go.mod" step in a real run.
