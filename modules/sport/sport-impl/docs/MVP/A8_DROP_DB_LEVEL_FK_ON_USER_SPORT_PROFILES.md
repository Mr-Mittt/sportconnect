# A8 · Drop DB-level FK on `user_sport_profiles.user_id`

**Status:** `DONE`
**Type:** Enhancement (Architecture)
**Filed:** 2026-08-10, as part of a repo-wide sweep for cross-domain DB-level FKs, following the
precedent set by `post-impl`'s A13 (`posts.sport_id`, `TODO`) — same rationale, applied
domain-by-domain (this module's own counterpart: a `sport-impl` table referencing *into*
`user-impl` instead of A13's `post-impl` table referencing into this module).

**Found:** `user_sport_profiles.user_id` carries a real Postgres FK into `users` (owned by
`user-impl`, a different domain) — constraint name `user_sport_profiles_user_id_fkey`,
`ON DELETE CASCADE`. Confirmed via `information_schema.table_constraints` against the live
`sportconnect_dev` database. Predates root `CLAUDE.md`'s "cross-domain references use IDs only"
rule (added 2026-07-07) — the table was created well before that (A3's JSONB `attributes` column
was added later, but the base table and this FK predate it), never retrofitted since Liquibase
migrations are append-only. `UserSportProfile.userId` is already a plain `UUID` field in the JPA
entity, no `@ManyToOne` — the application layer already complies; only the schema constraint
doesn't.

**Why it matters:** same as A13 — a DB-level FK is a hard schema coupling that works against
"monolith-first, microservice-ready." Extracting `sport` into its own service later would need
this dropped first as a blocking pre-step.

**Fix approach:**
```sql
ALTER TABLE user_sport_profiles DROP CONSTRAINT user_sport_profiles_user_id_fkey;
```
Confirm the actual constraint name via `\d user_sport_profiles` before writing the migration.
One new Liquibase changeset, next sequential `Vxxx` file, registered in
`db.changelog-master.xml`. No entity/service/DTO change — purely schema-level.

**Verify before/after:** confirm no code path relies on the FK's `ON DELETE CASCADE` — a user
hard-delete would currently cascade-remove their sport profiles automatically; grep
`UserServiceImpl` for a hard-delete-user path (per A2 in `user-impl`'s own backlog, deletes there
are soft via `is_active`, so this cascade has likely never fired in practice, but confirm rather
than assume).

**Out of scope:** `sports` table itself (no FK to remove, it's this module's own root entity);
`user_sport_profiles.sport_id` (already intra-domain, both owned by `sport-impl`, correctly no
issue); any change to `UserSportProfile`'s JPA entity or `UserSportProfileServiceImpl`.

---

## Implementation summary (`DONE`, 2026-08-20)

Schema-only, as filed. No Java file was touched — no entity, repository, service, DTO, controller,
or security-config change, and no new Spock test (there is no behavior to assert, and a unit test
with mocked repositories cannot observe a DB constraint either way).

### The approved plan (Phase 3)

One new Liquibase changeset dropping `user_sport_profiles_user_id_fkey`, registered in
`db.changelog-master.xml`, with the constraint name verified against the live `sportconnect_dev`
database before writing it. Explicitly rejected in the plan: a defensive
`DROP CONSTRAINT IF EXISTS`. A name mismatch should fail loudly at startup rather than silently
no-op and leave the FK in place — verifying the real name is what makes the strict form safe.

Also settled up front (Phase 1): the `ON DELETE CASCADE` this FK carries is *not* replaced with
application-level orphan cleanup. Cleanup code would have meant a new cross-domain call from
`user-impl` into `sport-api`, which is a real design decision deserving its own ticket, not a
side effect of a schema cleanup.

### What was built

| File | Change |
|---|---|
| `server/src/main/resources/db/changelog/changes/V058__drop_user_sport_profile_cross_domain_fk.sql` | New. Header comment carrying the cascade analysis, then one `ALTER TABLE ... DROP CONSTRAINT`. |
| `server/src/main/resources/db/changelog/db.changelog-master.xml` | 3 lines appended (comment + `<include>`). Additive only. |

### Key decisions

- **Followed the established house style rather than inventing one.** This is the fifth migration
  of exactly this kind — `V045` (location), `V046` (session), `V048` (post, which absorbed the A13
  this ticket cites as its precedent), `V049` (group). Same plain-SQL shape, same practice of
  putting the *reasoning* in a header comment so the cascade analysis lives in schema history
  rather than only in a doc that may drift.
- **`user_sport_profiles.sport_id` deliberately left in place.** Both `user_sport_profiles` and
  `sports` are owned by `sport-impl`, so that FK is intra-domain and correct. Only the FK pointing
  *into* `user-impl` violates the rule. Called out in the migration comment so a future reader
  doesn't mistake it for a missed case.

### The cascade question, resolved

Dropping the FK removes its `ON DELETE CASCADE`, which would in principle orphan a user's sport
profiles on a user row delete. Confirmed rather than assumed, per the ticket's own instruction:

- `UserServiceImpl.deleteUser()` (`UserServiceImpl.java:215`) is a **soft** delete —
  `isActive = false`, logging `"Soft deleted user"`.
- A repo-wide grep for `userRepository.delete` / `userRepository.deleteById` returns **zero**
  callers.

There is no hard-delete-user path anywhere in the codebase, so this cascade has never fired in
practice. Same conclusion `V048` and `V049` reached and shipped on. If a hard-delete path is ever
added, orphan cleanup for every domain holding a `userId` becomes its own cross-cutting concern —
this ticket does not pre-solve it for one table.

### Non-obvious constraints

- **The `:server:test` H2 schema needed no change.** `server/src/test/resources/schema.sql:60-78`
  already mirrors `user_sport_profiles` *without* this FK, with a comment explicitly noting "minus
  the cross-domain FK into users (A8 is removing that in the real schema anyway)". A7 anticipated
  this ticket, so `:server:test` could not regress from the drop.
- **Dropping the constraint does not drop the index.** `idx_user_sport_profiles_user_id` is a
  separate `CREATE INDEX` in V003, and `UNIQUE(user_id, sport_id)` is a separate constraint —
  both survive. The unique constraint is load-bearing (a soft-deleted profile still occupies the
  pair), so this was verified explicitly post-migration, not assumed.

### Verification

Against the real dev Postgres, not just H2:

- **Constraint name confirmed live before writing the migration** — `pg_constraint` reported
  `user_sport_profiles_user_id_fkey` → `users` with `confdeltype = 'c'` (CASCADE), matching the
  name recorded at filing time.
- **Migration applied cleanly via `:server:bootRun`** — `ChangeSet ... ran successfully in 15ms`,
  `Liquibase: Update has been successful. Rows affected: 1`, then
  `Started SportConnectApplication in 12.257 seconds`.
- **Post-state confirmed** — `user_sport_profiles` now carries only
  `user_sport_profiles_sport_id_fkey` → `sports`; `databasechangelog` records V058 as `EXECUTED`;
  all 5 indexes/constraints intact; all 40 existing profile rows intact.
- `./gradlew :modules:sport:sport-impl:test` — **59/59 pass**.
- `./gradlew :server:test` — **105 tests, 0 failures** (`BUILD SUCCESSFUL`), with the daemon up so Testcontainers Redis starts.

**Environment note (not a finding about this change):** the first `:server:test` run reported 59
failures, all `NoClassDefFoundError: Could not initialize class SharedRedisContainer` — the local
Docker daemon was down, so Testcontainers could not start Redis. Every Redis-free class passed in
that same run, including `SportActiveGateIntegrationTest` (5/5), the one class that actually
exercises `user_sport_profiles`. The suite was re-run with the daemon up.
