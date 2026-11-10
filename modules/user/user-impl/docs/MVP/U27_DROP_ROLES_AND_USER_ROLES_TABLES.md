# U27 · Drop the `roles` and `user_roles` tables and the `Role` entity

**Status:** `DONE` (2026-11-09)
**Type:** Enhancement (Architecture, schema removal)
**Depends on:** A37 and INFRA-25 (shipped in the same server release as A37, see the scope change below)
**Filed:** 2026-11-09, `/feature` session "Move roles to Keycloak": step 2, so that rollback of A37 stays a plain redeploy until production has proven the token roles.

Remove `Role`, `RoleRepository`, `User.roles`/`addRole`/`removeRole` and `UserService.getUserRoles`, add `V084__drop_roles_and_user_roles.sql` (registered in `db.changelog-master.xml`), and update the test `schema.sql` mirror. The release note says the previous release still works (nothing reads the tables) and that a restore does not bring them back.

**Scope change (2026-11-09, owner's decision): U27 ships in the same server release as A37, not a few days later.** The "A37 running in production first" dependency is dropped. Consequence: the previous server release (0.1.2) can no longer be redeployed after this release starts (it loads `user_roles` with every user), so the rollback is a restore of a database dump taken before the deploy. The release notes' Manual actions therefore carry: export the ADMIN ids, `pg_dump` of `roles` and `user_roles`, and the realm roles step (INFRA-25) first. Added to scope: V084 is run once against a real Postgres (the ITs run on H2 with Liquibase off, so no test applies the migration).

**Edge cases:** the export of the ADMIN ids must already exist; the migration runs at server start-up, so write the note's Manual actions on the box accordingly.

**Out of scope:** group roles (`GroupMember`/`group_roles`), anything in Keycloak.

---

## Implementation summary (2026-11-09)

**Design (as approved).** Pure removal, no new endpoint, job or cross-domain call, so the account-lifecycle rule has nothing to add (the `isActive` gate is untouched). One migration, `V084__drop_roles_and_user_roles.sql`: `DROP TABLE IF EXISTS user_roles; DROP TABLE IF EXISTS roles;` (the join table first, it holds the foreign keys), registered in `db.changelog-master.xml`.

**Built.**
- Deleted `Role`, `RoleRepository` and `RoleSpec`; removed `User.roles` / `addRole` / `removeRole`, `UserServiceImpl.roleRepository` (field and constructor argument) and `getUserRoles` (in `UserService` and the impl).
- Test `schema.sql` no longer mirrors `roles` and `user_roles`. Twelve integration tests and the Spock specs that built users with roles were updated; `BaseIT.createUserWithRoles` keeps its signature (the roles go into the token, nothing is stored). Removed one test, `aRoleHeldOnlyInTheDatabase_grantsNothing`, whose premise (a DB role row) can no longer exist, and one `getRoles()` assertion in `KeycloakCallbackIntegrationTest`.
- Consumer census: no main-code caller of `getUserRoles` or `User.getRoles`; `UserResponse.roles` and the client contract are unchanged; the `group-impl` hits are `GroupRole`, a different table (out of scope).
- `documentation/release-notes/SERVER.md` (Unreleased): the pre-deploy ADMIN export and `pg_dump` of the two tables, the changed rollback (redeploy 0.1.2 and `psql < roles-before-u27.sql`, or the nightly backup), the migration under "Applied automatically". `PRODUCTION_DEPLOYMENT_GUIDE.md` section 16 records the exception to "add first, remove a release later" plus a history row. `user-impl/CLAUDE.md` updated.

**Divergence from the original ticket.** It said to wait for A37 to run in production first, so the previous release would keep working. The owner chose one release for both, so that safety net is gone; the notes and the guide say so.

**Tests.**
- `:modules:user:user-impl:test` and `:modules:auth:auth-impl:test`: green.
- `:server:test`: 697 tests, 691 pass, 6 fail, all `SessionEventsConsumerIntegrationTest` (`AmqpIOException` while connecting to RabbitMQ). The same 6 fail on a clean `master` checkout run on this machine (698 tests), and the class passes alone (6 of 6), so they are not caused by U27. They are the known flaky class in the project notes; they still need a look on their own.
- New `infra/scripts/test-drop-roles-tables.sh` (port 8096, a throwaway PostGIS): applies the 82 changelog files before V084, adds a user holding a role, applies V084, and checks that exactly `roles` and `user_roles` went, `users` and `group_roles` are untouched, and a second run is harmless. 10 of 10 pass. Mutation check: with the two `DROP` lines swapped, 4 checks fail.
- e2e not run: no client file changed.

**Production (2026-11-09, server `0.2.0`, owner's pasted outputs).** Deployed on the live box: `Liquibase: Update has been successful. Rows affected: 1`, `Started SportConnectApplication in 20.908 seconds`, and `\dt roles` / `\dt user_roles` both found no relation. That is the real start-up with Liquibase's bookkeeping that the throwaway-Postgres test could not show. Checked afterwards (2026-11-10): the owner's local copy of the pre-deploy dump `roles-before-u27.sql` (written on their computer 2026-11-09 22:58 local time, before the 16:07 UTC server start if that clock is UTC+7) holds the four roles and 5 `user_roles` rows, all `USER`, none `ADMIN`, so no admin access was lost. Not pasted: the `databasechangelog` row for `V084` and the ADMIN export query output (it would have returned no rows). The role behaviour afterwards (owner's word) is in A37.
