# A37 · Roles come from the Keycloak token (`realm_access.roles`)

**Status:** `TODO`
**Type:** Enhancement (Architecture)
**Depends on:** INFRA-24 (release notes), INFRA-25 (the production realm has the roles first)
**Filed:** 2026-11-09, `/feature` session "Move roles to Keycloak": roles lived in our `roles` and `user_roles` tables and `ADMIN` could only be granted by a manual insert; Keycloak should own them.

`JwtAuthenticationFilter` builds `ROLE_<name>` authorities from the verified token's `realm_access.roles` (only `USER` and `ADMIN` are kept). The per-request gate still asks `UserService.getAccessState` whether the user exists and is active, so deactivation is unchanged; `UserAccessState` becomes `UserAccessState(isActive)` and the Redis value `1`/`0` (the decoder still reads the old `1|USER,ADMIN` for its 60 s TTL). The callback and refresh responses and `GET /api/users/me` return `roles` from the token. Provisioning stops attaching `USER`. Realm roles `USER` and `ADMIN` plus `USER` as the default role are created by `infra/scripts/realm-roles.mjs` (api and file modes, mirrored into `sportconnect-realm.json`) with `apply-realm-roles.sh` and `verify-realm-roles.mjs`. A token without `USER` gets 403 until its next refresh (up to 5 minutes); a revoked role works until the access token expires (accepted).

**Census:** `UserAccessState` and its specs, `getUserRoles`, `UserResponse.roles`, the Redis key row in `REDIS_KEYS.md`, `BaseIT`/`TestKeycloak` and 13 ITs. The client keeps receiving `roles: string[]` (compatible as-is). Chat reads no roles.

**Tests:** claim to authorities, no claim, unknown names ignored, a deactivated user with a valid ADMIN token refused, a DB-only role grants nothing, USER 200 / ADMIN-endpoint 403, callback roles equal token roles, realm script idempotence.

**Out of scope:** client roles, VENDOR and GROUP_OWNER, a role-management UI, faster revocation, a DB fallback, dropping the tables (U27).
