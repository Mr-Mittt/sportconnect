# U27 · Drop the `roles` and `user_roles` tables and the `Role` entity

**Status:** `TODO`
**Type:** Enhancement (Architecture, schema removal)
**Depends on:** A37 shipped and running in production for a few days, INFRA-25 run (the ADMIN ids were exported before this)
**Filed:** 2026-11-09, `/feature` session "Move roles to Keycloak": step 2, so that rollback of A37 stays a plain redeploy until production has proven the token roles.

Remove `Role`, `RoleRepository`, `User.roles`/`addRole`/`removeRole` and `UserService.getUserRoles`, add `V084__drop_roles_and_user_roles.sql` (registered in `db.changelog-master.xml`), and update the test `schema.sql` mirror. The release note says the previous release still works (nothing reads the tables) and that a restore does not bring them back.

**Edge cases:** the export of the ADMIN ids must already exist; the migration runs at server start-up, so write the note's Manual actions on the box accordingly.

**Out of scope:** group roles (`GroupMember`/`group_roles`), anything in Keycloak.
