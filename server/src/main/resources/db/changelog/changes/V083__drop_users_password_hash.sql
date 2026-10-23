-- U24: the password lives only in Keycloak (the backend asks Keycloak to confirm the current one and to set a new one),
-- so the local hash is dead weight: every user provisioned from Keycloak had NULL here and the two checks that read it
-- (self-deactivation, change password) are gone. Dev data only, no production users existed before the Keycloak move.
ALTER TABLE users DROP COLUMN password_hash;
