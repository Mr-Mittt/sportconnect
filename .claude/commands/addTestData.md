You are importing the 75 standalone Badminton test sessions from
`documentation/md/BADMINTON_STANDALONE_SESSIONS_TEST_DATA.xlsx` into the local dev backend for a
given date. Arguments: $ARGUMENTS — a date in `YYYY-MM-DD` format. If missing or not in that
format, ask for one before doing anything.

This runs `documentation/scripts/add-test-data/add-test-data.mjs`, which reads the workbook's
"Session Generator" tab (case design: title, hour, location, capacity, feeType, feeAmountVnd,
autoApprove, author) and, for each of the 75 rows: computes `scheduledStart` for the given date,
logs in as that row's assigned author via the real `POST /api/auth/login` (one of the 6 real
`bao.mmo*` users — see the workbook's Authors tab; all 6 share one known dev password, hardcoded
in the script as `AUTHOR_PASSWORD`, cached per author so it only logs in once per distinct author
per run rather than once per row), and calls the real `POST /api/sessions` so the backend's own
side effects (companion `SESSION_POST`, creator auto-join, validation) all run normally — verified
live end-to-end (2026-09-23) via one real login + create-session call before this command was
written, confirming `postId`, `callerParticipation.status=JOINED`, and the UTC conversion of
`scheduledStart`/`scheduledEndAt` all came back correct. For the 15 rows flagged "Manual DB fix
needed = YES" in the workbook, it then runs the documented `UPDATE sessions SET is_public = false`
directly against the dev Postgres container, since `isPublic` still has no API-settable field (see
the workbook's Read Me tab and client ticket CLIENT-SESSION-22's Delta 2).

**Local dev only** — targets `http://localhost:8080` and the `sportconnect-dev-postgres-1`
container by hardcoded, unconditional design. Never point this at anything else.

**Not idempotent.** Running this twice for the same date creates 75 more sessions, not a
replacement — there is no dedup/upsert. Mention this plainly before running if the user hasn't
run it for this date before in the current conversation.

---

## Step 1 — Prerequisites

1. Confirm the workbook exists: `documentation/md/BADMINTON_STANDALONE_SESSIONS_TEST_DATA.xlsx`.
   If it's missing, stop and say so — this command has nothing to import without it.
2. Confirm the dev backend is reachable: `curl -s -o /dev/null -w "%{http_code}"
   http://localhost:8080/api/sports` (a public endpoint — 200 means the backend is up). If it's
   not reachable, stop and tell the user to start it (`./gradlew :server:bootRun`) rather than
   letting all 75 rows fail with connection errors.
3. Confirm the dev Postgres container is running: `docker ps --format "{{.Names}}" | grep -x
   sportconnect-dev-postgres-1`. If it's not running, stop and tell the user to start the dev
   stack (`docker compose -f infra/docker-compose.dev.yml up -d`) — needed both for the backend
   itself and for this command's own private-row SQL fix step.
4. Confirm the script's dependencies are installed: check for
   `documentation/scripts/add-test-data/node_modules`. If missing, run `npm install` inside
   `documentation/scripts/add-test-data/` first (one-time; installs `exceljs`).

## Step 2 — Run the import

From the repo root:

```bash
node documentation/scripts/add-test-data/add-test-data.mjs --date <DATE>
```

Let it run to completion — it prints one line per row as it goes, then a summary block. Don't
interrupt it partway; a partial run still leaves whatever sessions it already created in the DB
(this is expected, not a bug to fix).

## Step 3 — Report

Relay the script's own summary verbatim (created count, failed count, private-fix count/failures)
rather than re-deriving your own count. If anything failed:

- **Row-level create failures** — show the exact row/title/error the script printed. A `400` on
  every row usually means a `CreateSessionRequest` validation rule changed since this script was
  written (check `modules/session/session-api/.../CreateSessionRequest.java` against the payload
  the script builds) — don't guess, look.
- **Private-fix failures** — the session itself was created successfully; only the `isPublic`
  flip failed (e.g. Postgres container not reachable from `docker exec`). Give the user the exact
  `UPDATE sessions SET is_public = false WHERE id = <id>;` statement(s) to run by hand.

Do not silently retry failed rows — report them and let the user decide (re-run the whole date,
or fix up the specific failures manually).
