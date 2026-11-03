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
| GHCR token (classic PAT, only `read:packages`) | `docker pull` and registry reads of `sportconnect-deploy` | `~/.docker/config.json` (written by `docker login`); the store item `ghcr-token` if `fetch-secrets.sh` does the login | New token on GitHub, then `read -rs T; printf '%s' "$T" \| docker login ghcr.io -u <github user> --password-stdin`. **Expiry date: not recorded here; the owner adds it from GitHub, Settings, Developer settings, Tokens** |
| SSH private key of the box | Logging in as `ubuntu` | The owner's computer (never on the box) | New key pair in the console; `authorized_keys` |

**Not secrets, but worth knowing:** the OCI Object Storage bucket and the Vault are reached with the box's instance principal (dynamic
group `sportconnect-box`), so no OCI key exists on the box. Caddy's certificates are in the `caddy_data` volume, which the backup
holds (it contains private keys; the bucket is private).

**If a value leaks:** replace it using the row above, then look for where it travelled (a pasted chat, a log) and say so in the ticket.
