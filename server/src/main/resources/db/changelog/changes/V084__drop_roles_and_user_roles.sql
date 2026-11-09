-- U27: roles are Keycloak's (A37): the backend reads USER / ADMIN from the access token's realm_access.roles and nothing reads
-- these two tables any more. user_roles first (it holds the foreign keys to users and roles). IF EXISTS keeps a re-run harmless.
-- Not undone by a restore: a database dump taken before this migration is the only way back (see release-notes/SERVER.md).
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS roles;
