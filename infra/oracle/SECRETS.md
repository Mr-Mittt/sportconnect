# Secrets of the production box (INFRA-14)

An inventory: what exists, where each value is used, and how to replace it. **No value is written here or anywhere in the repo.**
The values are held in the secrets store (OCI Vault or SOPS+age, see `scripts/fetch-secrets.sh`; which one is recorded in the guide's
change history) and in an encrypted copy in the owner's password manager. On the box they exist only as files made by
`fetch-secrets.sh` in tmpfs (`/dev/shm/sportconnect`, mode 600), and inside the containers' own settings after a start.

Passwords for the backing services are 16 to 128 characters of `A-Z a-z 0-9 _ -`, made with `openssl rand -hex 24`
(`rotate-credentials.sh` refuses anything else). After any rotation: change the value in the store, run `fetch-secrets.sh` again,
then do the steps in the last column. Section numbers are those of `infra/documentation/PRODUCTION_DEPLOYMENT_GUIDE.md`.

| Secret | Purpose | Where it is used (file: variable) | How to rotate |
|---|---|---|---|
| Postgres superuser password | An admin session; backups do not use it (they use the container's local socket) | `stack.env`: `POSTGRES_PASSWORD` | New value in `stack.env`; `rotate-credentials.sh postgres` |
| App database role `sc_app` | The server's connection to `sportconnect_dev` | `stack.env`: `SC_APP_DB_PASSWORD`; `server.env`: `DB_PASSWORD` | Same value in both files; `rotate-credentials.sh postgres`; recreate the server (`sportconnect-deploy` re-runs it, or section 18) |
| Chat database role `sc_chat` | Chat's connection to `sportconnect_chat_dev` | `stack.env`: `SC_CHAT_DB_PASSWORD`; `chat.env`: the password inside `CHAT_DATABASE_URL` | Same value in both; `rotate-credentials.sh postgres`; recreate chat |
| Keycloak database role `sc_keycloak` | Keycloak's connection to `keycloak_dev` | `stack.env`: `KC_DB_PASSWORD` | New value; `rotate-credentials.sh postgres`; `start-stack.sh` (recreates Keycloak) |
| RabbitMQ user and password | AMQP and the STOMP relay of the server (one login for both) | `stack.env`: `RABBITMQ_USERNAME`, `RABBITMQ_PASSWORD`; `server.env`: `RABBITMQ_USERNAME`, `RABBITMQ_PASSWORD` | Same values in both; `rotate-credentials.sh rabbitmq`; recreate the server |
| Redis password | Shared by the server and chat (chat needs 0.2.2 or later) | `stack.env`, `server.env`, `chat.env`: `REDIS_PASSWORD` | Same value in all three; `start-stack.sh` (recreates Redis); recreate the server and chat |
| Keycloak admin password | The master-realm admin: the console through the SSH tunnel and every realm script | `kc-admin-pw` (one line; `~/.kc-admin-pw` on a box without the store) | `set-admin-pw.sh` on the box (hidden prompt); put the same value in the store |
| Credentials client secret | The backend's confirm-password and set-password client `sportconnect-credentials` (U24) | `server.env`: `KEYCLOAK_CREDENTIALS_CLIENT_SECRET`; the realm client | New value in `server.env`; `apply-realm-production.sh apply`; recreate the server |
| Internal service secret | The server's `/internal/sync/**` bootstrap endpoints, called by chat | `server.env` and `chat.env`: `INTERNAL_SERVICE_SECRET` (byte-identical) | New value in both; recreate the server and chat together |
| Brevo SMTP key | Outgoing mail: the server's welcome email and Keycloak's reset and verification mails | `server.env`: `MAIL_PASSWORD` (+ `MAIL_USERNAME`); the realm's SMTP settings | New key in Brevo; `server.env`; `apply-realm-production.sh apply`; recreate the server. **Not rotated for now: owner's decision (INFRA-3 row 23); an older key sits in an old transcript** |
| Google OAuth client secret | Google sign-in (A29) | The realm's `google` identity provider; the git-ignored `infra/keycloak/providers/client_secret_*.json` on the machine that applies it | New secret in Google Cloud; `infra/scripts/apply-realm-google-provider.sh` |
| GHCR token (classic PAT, only `read:packages`) | `docker pull` and registry reads of `sportconnect-deploy` | `~/.docker/config.json` (written by `docker login`); the store item `ghcr-token` (one line `<github user>:<token>`) if `fetch-secrets.sh` does the login; item `sportconnect-prod-ghcr-token` created and fetched 2026-11-04 (owner's word) | New token on GitHub, then `read -rs T; printf '%s' "$T" \| docker login ghcr.io -u <github user> --password-stdin`. **Expiry date: not recorded here; the owner adds it from GitHub, Settings, Developer settings, Tokens** |
| SSH private key of the box | Logging in as `ubuntu` | The owner's computer (never on the box) | New key pair in the console; `authorized_keys` |

**Not secrets, but worth knowing:** the OCI Object Storage bucket and the Vault are reached with the box's instance principal (dynamic
group `sportconnect-box`), so no OCI key exists on the box. Caddy's certificates are in the `caddy_data` volume, which the backup
holds (it contains private keys; the bucket is private).

**If a value leaks:** replace it using the row above, then look for where it travelled (a pasted chat, a log) and say so in the ticket.

## Rotation status (checked 2026-11-04 against the INFRA-3 rebuild log and the INFRA-14 ticket)

One row per secret: when the value in use was set, what is known about it having been seen outside the box, and what is still open. "Unknown" means no record says either way; the owner's word replaces it. Keep this table current: change the row in the same change that rotates or exposes a value.

| Secret | Value in use set | Known exposure | Open action |
|---|---|---|---|
| Postgres superuser | 2026-11-03 (INFRA-14 live rotation; before that the dev default `sa`) | The old `sa` is in the repository and in old transcripts; it no longer works | none |
| `sc_app`, `sc_chat`, `sc_keycloak` | 2026-11-03 (roles created by `rotate-credentials.sh postgres`) | none known | none |
| RabbitMQ `sc_mq` | 2026-11-03 (`rotate-credentials.sh rabbitmq`; `guest` removed) | The old `guest/guest` was the dev default; it no longer exists | none |
| Redis password | 2026-11-03 (before that Redis had no password) | none known | none |
| Keycloak admin password | 2026-11-04 (typed by the owner into `set-admin-pw.sh`; the Vault copy matched afterwards) | The INFRA-12 password was supplied in a chat (INFRA-12 setup log row 41); the owner replaced it on 2026-10-27 (INFRA-3 rebuild log row 21), and again on 2026-11-04 | none |
| Credentials client secret | 2026-10-27, made random on the box (INFRA-3 rebuild log row 9: "no secret was printed or typed in a chat"); set on the realm client by `apply-realm-production.sh apply` on 2026-11-03 (read-back matched) | none known; whether it ever showed in a log or terminal capture is **unknown** | none: owner's decision 2026-11-04, a system-to-system value set once and kept; replaced by hand only if it leaks (new value in `server.env`, `apply-realm-production.sh apply`, recreate the server), no rotation command planned |
| Internal service secret | 2026-10-27, made random on the box, the same row 9, byte-identical in `server.env` and `chat.env` | none known; **unknown** as above. The INFRA-12 sandbox used the dev value `some-shared-dev-secret`, which is in the repository and is not this value | none: owner's decision 2026-11-04, set once and kept; replaced by hand only if it leaks (new value in both files, recreate the server and chat together), no rotation command planned |
| Brevo SMTP key | The key from the INFRA-12 sandbox, still in use | **Exposed**: it was pasted in a chat (INFRA-3 rebuild log rows 19 and 23) | Rotation deferred by the owner's decision (row 23, 2026-10-28). INFRA-14 follow-up: `rotate-credentials.sh smtp` (not built yet) makes it one command after the new key is issued in Brevo |
| Google OAuth client secret | not recorded | unknown | Owner: record when it was created and where the JSON file is kept |
| GHCR token (classic PAT, `read:packages`) | 2026-10-30 (INFRA-3 rebuild log row 25, typed with `read -rs`, never shown) | none known | Owner: record the expiry date here, so the pull does not fail unnoticed. INFRA-14 follow-up: `rotate-credentials.sh ghcr` (not built yet) logs in with a new token and prints its expiry |
| SSH private key of the box | not recorded | unknown | none planned |
| Plain copies on the box (`~/web/server.env`, `chat.env`, their `.old` copies, the dot-files `~/.internal-secret`, `~/.cred-secret`, `~/.brevo-smtp-*`) | n/a | They hold the live Brevo key, the credentials and internal secrets, and the old (dead) passwords, in plain files on the disk that the backups do not include | Guide section 18 step 9: after the backup that follows the rotation, `shred -u` them |
