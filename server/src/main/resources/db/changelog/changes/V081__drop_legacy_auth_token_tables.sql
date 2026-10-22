-- A28: the pre-Keycloak auth tables go. Sessions are Keycloak's (A25/A26), and password reset and email verification are
-- Keycloak's own flows, so nothing reads or writes these any more:
--   refresh_tokens          the HS256 refresh-token store (the cookie now holds Keycloak's refresh token)
--   password_reset_tokens   our reset links (Keycloak sends its own)
--   email_verifications     our verification links (Keycloak sends its own)
-- Rows are not migrated: a reset or verification link in flight dies with this change, and users ask for a new one at
-- Keycloak; every live session was already unusable since A25 (the legacy HS256 token is accepted nowhere).
-- Dropping a table drops its indexes and constraints with it. One-way: the data is not recoverable from here.
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS password_reset_tokens;
DROP TABLE IF EXISTS email_verifications;
