# INFRA-8 · `services/chat` Dockerfile publish workflow

**Status:** `TODO` · **Type:** Infrastructure (CI, artifact-scoped) · **Dependency:** INFRA-3 ·
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
