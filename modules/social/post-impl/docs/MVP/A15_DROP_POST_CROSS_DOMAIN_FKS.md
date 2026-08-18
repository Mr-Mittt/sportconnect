# A15 · Drop DB-level FKs on post-impl tables' cross-domain columns (absorbs A13)

**Status:** DONE (2026-08-10)
**Type:** Enhancement (Architecture)
**Migration:** `V048__drop_post_tables_cross_domain_fks.sql`

## Context

Filed 2026-08-10 in a repo-wide sweep for cross-domain DB-level FKs (see `aac6e6b`), following on
from this same module's original A13 (`posts.sport_id`, filed 2026-08-07 during a client SPORT-3
session). The sweep found `posts.sport_id` wasn't the only cross-domain FK left in this module —
six more existed, all in the same "predates `CLAUDE.md`'s cross-domain-refs rule, never
retrofitted" shape. Rather than ship two near-identical migrations touching overlapping tables,
**A13 was merged into A15** (2026-08-10, user decision) and no longer exists as a standalone
backlog entry — this ticket covers everything both originally scoped.

## What was verified before implementing

1. **Constraint names**, via `\d <table>` against the live `sportconnect_dev` database, for all
   7 columns:
   - `posts_sport_id_fkey` (→ `sports`, `ON DELETE SET NULL` — absorbed from A13)
   - `posts_user_id_fkey` (→ `users`, `ON DELETE CASCADE`)
   - `posts_group_id_fkey` (→ `groups`, `ON DELETE CASCADE`)
   - `comments_user_id_fkey` (`ON DELETE CASCADE`)
   - `comment_likes_user_id_fkey` (`ON DELETE CASCADE`)
   - `post_likes_user_id_fkey` (`ON DELETE CASCADE`)
   - `post_shares_user_id_fkey` (`ON DELETE CASCADE`)

   All matched the ticket's stated names exactly.

2. **No code path relies on any of the three domains' cascade/set-null behavior.** Grepped and
   read all three:
   - `UserServiceImpl.deleteUser()` — soft delete (`isActive = false`), never a row delete.
   - `GroupServiceImpl.deleteGroup()` (`GroupServiceImpl.java:421-434`) — same pattern, soft
     delete via `isActive = false`.
   - `SportServiceImpl.deleteSport()` — same pattern, soft delete via `isActive = false`.

   None of these three domains ever hard-deletes a row, so none of the seven
   `ON DELETE CASCADE`/`SET NULL` behaviors have ever fired in practice.

## What was built

One Liquibase changeset, `V048__drop_post_tables_cross_domain_fks.sql`, registered in
`db.changelog-master.xml`:

```sql
ALTER TABLE posts DROP CONSTRAINT posts_sport_id_fkey;
ALTER TABLE posts DROP CONSTRAINT posts_user_id_fkey;
ALTER TABLE posts DROP CONSTRAINT posts_group_id_fkey;
ALTER TABLE comments DROP CONSTRAINT comments_user_id_fkey;
ALTER TABLE comment_likes DROP CONSTRAINT comment_likes_user_id_fkey;
ALTER TABLE post_likes DROP CONSTRAINT post_likes_user_id_fkey;
ALTER TABLE post_shares DROP CONSTRAINT post_shares_user_id_fkey;
```

Purely schema-level — no entity, repository, service, or DTO change. All seven JPA fields were
already plain `UUID`/`Long` with no `@ManyToOne`, so the application layer was already compliant;
only the schema constraints weren't.

`post_reports`' matching `reporter_id`/`reviewed_by` FKs were deliberately excluded — no
`PostReport` JPA entity/repository/service/controller exists anywhere in the repo (confirmed by
grep), so dropping its FK isn't a "post-impl architecture" fix in the same sense as the seven
above; left for whoever eventually decides what to do with that and the other 3 orphaned tables
found in the same sweep (`notifications`, `social_accounts`, `user_blocks`, `user_sessions`).

## Verification

- Applied against the running dev DB via `:server:bootRun` — Liquibase auto-runs on context init,
  changeset ran successfully in 20ms, recorded in `databasechangelog`. The server started fully
  this time (port 8080 was free after clearing a stray leftover process earlier in the session),
  so this was verified against a real running instance, not just the migration log — a quick
  `curl localhost:8080/api/posts/feed` returned a clean `401 Unauthorized` JSON response (correct
  behavior for an unauthenticated call, and confirms the app boots and serves requests normally
  post-migration).
- Confirmed via `\d <table>` post-migration: all 7 cross-domain FKs gone from `posts`,
  `comments`, `comment_likes`, `post_likes`, `post_shares`. Every intra-domain FK (`*_post_id_fkey`
  → `posts.id`, `comments_parent_comment_id_fkey`, `comment_likes_comment_id_fkey`) and every
  index/check constraint untouched.
- `./gradlew :modules:social:post-impl:test` — pass.
- `./gradlew :server:test` — pass (one transient failure on first run, same
  `NoClassDefFoundError`-class flakiness seen earlier this session with LOC-3, unrelated to this
  change; reran clean twice in a row to confirm stability).

## Out of scope (unchanged)

Any same-domain (intra `post-impl`) FK, e.g. `comments.post_id`, `comment_likes.comment_id`,
`post_hashtags.post_id`/`hashtag_id`, `post_media.post_id`, `post_reports.post_id`,
`post_shares.post_id` — all correctly scoped, nothing to remove. Any change to any JPA entity,
service, or repository in `post-impl`. `post_reports`' orphaned-table FKs (flagged above, not
addressed here).

---

**Status:** `DONE` (2026-08-10) · **Summary:**
`modules/social/post-impl/docs/MVP/A15_DROP_POST_CROSS_DOMAIN_FKS.md`
**Type:** Enhancement (Architecture) · **Filed:** 2026-08-10, as part of a
repo-wide sweep for cross-domain DB-level FKs, following on from this same module's original A13
(`posts.sport_id`) — A13 was scoped narrowly to the one `sport_id` anomaly found while explaining
sport-relationship tables to the user; this sweep found `posts.sport_id` wasn't the only
cross-domain FK left in this module, just the only `sport_id` one. **A13 has since been merged
into this ticket** (2026-08-10, user decision — the two migrations would touch the same tables in
the same way, no reason to ship them separately) and no longer exists as a standalone entry in
this backlog; everything A13 covered is folded into the list and fix approach below.

**Found:** seven `post-impl`-owned columns carry a real Postgres FK across into a different
domain's table, confirmed via `information_schema.table_constraints` against the live
`sportconnect_dev` database:
- `posts.sport_id` → `posts_sport_id_fkey` (into `sport-impl`'s `sports`, `ON DELETE SET NULL` —
  absorbed from A13)
- `posts.user_id` → `posts_user_id_fkey` (into `user-impl`'s `users`, `ON DELETE CASCADE`)
- `posts.group_id` → `posts_group_id_fkey` (into `group-impl`'s `groups`, `ON DELETE CASCADE`)
- `comments.user_id` → `comments_user_id_fkey` (`ON DELETE CASCADE`)
- `comment_likes.user_id` → `comment_likes_user_id_fkey` (`ON DELETE CASCADE`)
- `post_likes.user_id` → `post_likes_user_id_fkey` (`ON DELETE CASCADE`)
- `post_shares.user_id` → `post_shares_user_id_fkey` (`ON DELETE CASCADE`)

All predate root `CLAUDE.md`'s "cross-domain references use IDs only" rule (added 2026-07-07) —
`posts`/`comments`/`comment_likes`/`post_likes`/`post_shares` (`V004`) are part of this repo's
initial commit (2026-03-03), confirmed via `git log` (`16a7cd4`). Every *other* cross-domain
`sport_id` column added since — `groups.sport_id`, `locations.sport_id`, `sessions.sport_id` — is
correctly FK-free from day one; `posts.sport_id`'s FK is the one exception, ~4 months older than
the rule and never retrofitted (Liquibase migrations are append-only). Every one of these seven
columns is already a plain `UUID`/`Long` field in its JPA entity, no `@ManyToOne` — the
application layer already complies; only the schema constraint doesn't. Same "predates
`CLAUDE.md`, never retrofitted" story as this module's own A5.

**`post_reports` deliberately excluded:** its two `user_id`-referencing columns
(`reporter_id`/`reviewed_by`) have the exact same cross-domain FK shape, but confirmed via a
repo-wide grep that **no `PostReport` JPA entity, repository, service, or controller exists
anywhere** — `V005__create_social_tables.sql` created the table but it was never wired up, same
"schema exists, no code owns it" pattern as `notifications`/`social_accounts`/`user_blocks`/
`user_sessions` (found in the same sweep, flagged separately, not part of any per-domain ticket
since no domain module actually implements them). Dropping a dead table's FK isn't a "post-impl
architecture" fix in the same sense as the seven above — leave it for whoever decides what to do
with the four other orphaned tables, rather than silently folding it into this module's ticket.

**Why it matters:** a DB-level FK is a hard coupling at the schema level, working against this
repo's "monolith-first, microservice-ready" goal — each of these locks `post-impl`'s tables to
`sport-impl`, `user-impl`, or `group-impl` staying in the same database/schema. Low urgency
(nothing is currently broken; the cascades largely mirror what the service layer would do anyway
on a hard delete, and `posts.sport_id`'s `ON DELETE SET NULL` is benign) but blocks a clean
extraction of any of these domains later unless dropped first.

**Fix approach:**
```sql
ALTER TABLE posts DROP CONSTRAINT posts_sport_id_fkey;
ALTER TABLE posts DROP CONSTRAINT posts_user_id_fkey;
ALTER TABLE posts DROP CONSTRAINT posts_group_id_fkey;
ALTER TABLE comments DROP CONSTRAINT comments_user_id_fkey;
ALTER TABLE comment_likes DROP CONSTRAINT comment_likes_user_id_fkey;
ALTER TABLE post_likes DROP CONSTRAINT post_likes_user_id_fkey;
ALTER TABLE post_shares DROP CONSTRAINT post_shares_user_id_fkey;
```
Confirm every constraint name via `\d <table>` before writing the migration — Postgres
auto-generates these names conventionally, not guaranteed. One Liquibase changeset (next
sequential `Vxxx` file, registered in `db.changelog-master.xml`) covering all seven. No
entity/service/DTO change — purely schema-level.

**Verify before/after:** confirm no code path relies on any of these `ON DELETE CASCADE`/
`SET NULL` behaviors specifically (vs. the service layer's own explicit delete/cleanup logic) —
`posts.user_id`/`comments.user_id`/etc. cascading away on a hard user-delete is plausible but
unconfirmed; grep `UserServiceImpl` for a hard-delete-user path before assuming the cascade is
redundant. `posts.group_id` cascading on group hard-delete is more clearly redundant —
`GroupServiceImpl.deleteGroup` already exists and its own behavior toward member posts should be
checked directly rather than assumed to match the DB cascade. `posts.sport_id`'s `SET NULL`:
`SportServiceImpl.deleteSport()` never hard-deletes a row (soft-delete via `is_active`), so this
cascade has likely never fired in practice — grep for any test or migration that hard-deletes a
`sports` row before assuming it's dead code.

**Out of scope:** any same-domain (intra `post-impl`) FK, e.g. `comments.post_id`,
`comment_likes.comment_id`, `post_hashtags.post_id`/`hashtag_id`, `post_media.post_id`,
`post_reports.post_id`, `post_shares.post_id` — all correctly scoped, nothing to remove; any
change to any JPA entity, service, or repository in this module.

---
