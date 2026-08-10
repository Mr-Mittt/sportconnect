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
