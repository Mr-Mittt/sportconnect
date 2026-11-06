# INFRA-23 · Full restore on a fresh box: realm steps, restore from the bucket, the new roles

**Status:** `TODO`
**Type:** Infrastructure (testing)
**Depends on:** INFRA-14 (the roles, the Vault fetch and `restore-test.sh` are proven first), INFRA-19 (a fresh box is built from the box image). 
**Filed:** 2026-11-05, split out of INFRA-14 item 3 at its pickup (owner's decision: INFRA-14 keeps `restore-test.sh` on a throwaway Postgres; the whole restore moves here). It is also the "realm steps and the restore on a fresh box" that INFRA-19 listed as not proven.

A rehearsal on a fresh A1 instance of rebuilding the production box from the bucket backup, following the guide's sections 17 and 18: a new box from the four hand-copied files and the box image (INFRA-19), `fetch-secrets.sh`, `restore-from-bucket.sh` (which re-applies the roles after the restore), the post-restore Keycloak scripts of section 17 step 5 (`set-credentials-client-secret.sh`, `set-master-frontend-url.sh`, the admin password), `apply-realm-production.sh check`, then the outside checks of section 10: a password sign-in, a Google sign-in, a chat message, a password-reset email. The rehearsal box uses a throwaway hostname (staging certificates), as the INFRA-19 rehearsal did, so it cannot disturb production. The result is recorded in the guide and here; the manual `tar` bundle of section 3 (approach B) is retired once this works.

**Entry point:** the owner, on a new A1 instance and the OCI console (dynamic group rule for the new instance, removed afterwards).

**Edge cases to settle at pickup:** how the restore treats the Keycloak admin password and the settings applied by API only (guide section 9 step 4); the Let's Encrypt account limit against a real hostname; the Google redirect URI, which is bound to the production hostname, so a Google sign-in on the rehearsal box may need a second redirect URI in the Google client (decide, do not assume).

**Out of scope:** changing production; a second production box; INFRA-17 (down-version deploys).

**Tests:** the rehearsal is the test. The guide's section 17/18 step lists become "run on 2026-..., owner's pasted outputs".
