# Production deployment guide (Oracle Cloud)

The one document to follow to build the SportConnect production box by hand, from an empty tenancy to `https://yoursport.vn` serving real users. **It is kept current by every infra ticket:** a ticket that changes how the box is built, configured, deployed, backed up or restored updates this file in the same change (rule in `CLAUDE.md`, section "Commands"). The change history is at the bottom.

How it was proven: the whole procedure ran twice on fresh boxes (INFRA-3, `INFRA-3_ORACLE_REBUILD_LOG.md`, 2026-10-27), the second time without touching a script. Sections marked **(not run yet)** describe a step nobody has executed.

Related files: the reference files and scripts are in `infra/oracle/`; the resource names are in `MVP/INFRA-3_ORACLE_RESOURCES.md`; the why behind the choices is in `MVP/INFRA-3_HOSTING_DECISION.md`; the older sandbox history is `MVP/INFRA-12_ORACLE_SANDBOX_RUNBOOK.md` and its setup log. Ports are in `PORTS.md`.

## 0. What you need before you start

- An Oracle Cloud tenancy (region `ap-melbourne-1`), with the trial credit or a paid account. Set a **budget alert** first; after the trial the box costs roughly $50 a month (unconfirmed estimate).
- Control of the `yoursport.vn` DNS (iNET).
- A Brevo account (free plan) for email, and the Google OAuth client for sign-in (`modules/auth/docs/GOOGLE_OAUTH_CLIENT_SETUP.md`).
- On your computer: the repo, JDK 21, `pnpm`, Git Bash or similar with `ssh`, `scp`, `tar`.
- A password manager: you choose the Keycloak admin password yourself and it never goes through chat.

## 1. Oracle console (once per tenancy, then per box)

**Once per tenancy**
1. **Network.** Networking → Virtual cloud networks → **Start VCN Wizard → "Create VCN with Internet Connectivity"** (VCN `10.0.0.0/16`, public subnet `10.0.0.0/24`). Do not use the instance form's "create new VCN": it leaves the public-IP switch locked.
2. **Security list** of the public subnet: ingress TCP **22, 80, 443** from `0.0.0.0/0`. The route table must send `0.0.0.0/0` to the **Internet Gateway** (target type Internet Gateway, not Private IP), or SSH times out.
3. **Backup bucket.** Object Storage → Create bucket `sportconnect-backups`: Standard tier, **private**, Oracle-managed encryption. Then in the bucket: Lifecycle Policy Rules → Create rule: action *Delete*, target *Objects*, **7 days**, enabled. The console may add the service policy `Allow service objectstorage-ap-melbourne-1 to manage object-family in tenancy`; if it does not, add it yourself, or the rule cannot delete.
4. **Dynamic group + policies** (the box signs in to Object Storage by its identity, no key is stored). Identity & Security → Domains → default domain → Dynamic groups → create `sportconnect-box` (rule in step 6 below). Identity & Security → Policies → in the root compartment add:
   - `Allow dynamic-group sportconnect-box to manage objects in tenancy where target.bucket.name = 'sportconnect-backups'`
   - `Allow dynamic-group sportconnect-box to read buckets in tenancy`
   (If the tenancy uses identity domains the group may need the prefix `Default/sportconnect-box`; the warning the console shows when you save names it.)
   **INFRA-14:** if the secrets store is OCI Vault, also create the vault, its software AES key and a third policy, `Allow dynamic-group sportconnect-box to read secret-bundles in tenancy`, as in section 18 part A. The statement names the group, so a rebuilt box needs nothing more than the OCID in the dynamic group's rule (step 6).

**Per box**
5. **Create the instance.** Compute → Instances → Create. Shape `VM.Standard.E3.Flex`, 2 OCPU / 12 GB (Always Free A1 was out of capacity; revisit under INFRA-12). **Pick the image after the shape and read that it says Ubuntu 24.04** (it reset to 20.04 once). Subnet: the public one, **public IPv4 on**. Boot volume 96 to 100 GB. Upload or generate the SSH key and **keep the private key outside the repo**. After creation, note the public IP. **Shapes (INFRA-12):** the production box is the Always Free **`VM.Standard.A1.Flex` (Ampere Altra, arm64), 2 OCPU / 12 GB** (Oracle's Always Free page lists 2 OCPU / 12 GB of A1 in total as of 2026-11-02; an older note of 4 / 24 is stale), 96 GB boot volume; an OCPU on A1 is one core without hyperthreads, so 2 OCPU is 2 vCPUs. The reference shape is the x86 `VM.Standard.E3.Flex`, 2 OCPU / 12 GB (4 vCPUs, paid after the trial credit). A1 capacity can be missing ("Out of host capacity"): when it is not, create it and keep it; do not resize or terminate it casually.
6. **Point the dynamic group at it.** Instance details → copy the OCID. Edit `sportconnect-box` → matching rule `ALL {instance.id = '<instance OCID>'}`. **A rebuilt box has a new OCID, so this step repeats every time.** **While two boxes coexist** (a rehearsal or a cutover) use `ANY {instance.id = '<box 1 OCID>', instance.id = '<box 2 OCID>'}` so the old box keeps writing its backups; take the old OCID out when it is retired. (Done for the A1 box on 2026-11-02, owner's word.)
7. First contact: `ssh -i <key> ubuntu@<ip>`, accept the host key, `cat /etc/os-release` must say 24.04 and `uname -m` x86_64 (E3.Flex) or aarch64 (A1). Tip: put the address and key in an SSH alias in `~/.ssh/config` on your computer (`Host sc-box`, `HostName <ip>`, `User ubuntu`, `IdentityFile <key>`, `IdentitiesOnly yes`; the file must be named exactly `config`, no `.txt`), then `ssh sc-box`, `scp file sc-box:~/` and `ssh -L … sc-box` all work without the key and address. The file stays on your computer; nothing of it is committed. Section 3 runs unchanged on either architecture (`box-prepare.sh` installs the right Docker packages).

## 2. DNS (iNET)

Create: A `yoursport.vn` → `<ip>`, A `auth.yoursport.vn` → `<ip>`, CNAME `www.yoursport.vn` → `yoursport.vn`. Check with `nslookup yoursport.vn 8.8.8.8` and against the authoritative `ns1.inet.vn`.

When rebuilding a live site, build and test the new box **before** switching DNS: Caddy can serve the existing certificates (step 5.6) and you can test with `curl --resolve yoursport.vn:443:<new-ip> https://yoursport.vn/`. Do not use a hosts-file line as the final check: it masks real DNS. Switch DNS last.

## 3. Prepare the box

1. Copy `infra/oracle/scripts/box-prepare.sh` to the box and run `bash box-prepare.sh`. It opens 80 and 443 in iptables (Oracle's Ubuntu image blocks them even when the security list allows them), persists the rules, and installs Docker and Compose. Open a **new SSH session** so the `docker` group applies.
2. (Replaced by INFRA-6: nothing is built on your computer or on the box any more; the images come from GHCR, section 16.)
3. Bundle and copy (no git credentials on the box): `tar` the repo files listed at the top of `infra/oracle/scripts/start-stack.sh` (leave out `.env` files and `client_secret_*.json`; scan the entry list for secrets before sending) and `scp` them. They unpack to `~/sportconnect` and `~/web`. The server, chat and the client files are no longer copied from a computer: `sportconnect-deploy` pulls them from GHCR (section 16; INFRA-6). **From a Windows computer the files have CRLF line endings** (the working copy, and `git archive` too, because of `core.autocrlf`), and bash rejects the scripts: after unpacking run `find ~/sportconnect ~/web -type f \( -name '*.sh' -o -name '*.yml' -o -name '*.sql' -o -name '*.json' -o -name '*.properties' -o -name '*.ftl' -o -name '*.conf' -o -name Caddyfile -o -name enabled_plugins \) -exec sed -i 's/\r$//' {} +` (never over the JARs), and `~/web/Caddyfile` and `kc-prod.override.yml` are copies taken after that. (Found on the A1 box, 2026-11-02.)

## 4. Secrets and environment files (on the box only)

All files `chmod 600`, created with `umask 077`, never typed into chat or onto a command line.

- `~/.internal-secret` and `~/.cred-secret`: `openssl rand -hex 24`.
- `~/.kc-admin-pw`: created in section 6.1 by `set-admin-pw.sh`.
- `~/.brevo-smtp-key` and `~/.brevo-smtp-user`: the Brevo SMTP key and login (section 7). Type them with hidden input (`read -rs`).
- `~/web/server.env` and `~/web/chat.env` from `infra/oracle/server.env.example` and `chat.env.example`: replace every `<placeholder>`; the internal secret must be identical in both files; `KEYCLOAK_CREDENTIALS_CLIENT_SECRET` equals `~/.cred-secret`. Mail is not part of `/actuator/health` in the `prod` profile (INFRA-11), so an empty `MAIL_*` does not make the server unhealthy; it only means no welcome email.
- **INFRA-14:** `~/web/stack.env` from `infra/oracle/stack.env.example` holds the passwords of Postgres (the superuser and one role each for the app, chat and Keycloak), RabbitMQ and Redis; the same values appear in `server.env` and `chat.env`. `infra/oracle/SECRETS.md` lists every secret, where it is used and how to rotate it. `fetch-secrets.sh` can make all of these files from a secrets store into tmpfs instead (section 18); until then they are plain `chmod 600` files in `~/web`.

## 5. Start the stack

1. `bash ~/sportconnect/infra/oracle/scripts/start-stack.sh`. It starts Compose with the production override (Keycloak in production mode, every backing service on `127.0.0.1` only) and Caddy. It does **not** start the server, chat or the client files: run `sportconnect-deploy` for them (section 16). Expect Postgres, Redis, RabbitMQ, Keycloak, Mailpit and Caddy up, then the server and chat after the first deploy.
2. If the site already exists elsewhere, **keep its certificates** so Caddy does not have to pass Let's Encrypt validation before DNS moves (and to stay under its rate limit): stream the old box's `caddy_data` volume into the new one (`ssh <old> 'tar czf - …' | ssh <new> 'tar xzf - …'` into the volume) before step 1, or restore it from a backup (section 9). Never delete the `caddy_data` volume.
3. A **brand new** site needs DNS (section 2) pointing at the box first; Caddy then gets its certificates by itself.
4. **The Postgres image (INFRA-12).** The production override runs `ghcr.io/mr-mittt/sportconnect-postgis:16-3.6` (`infra/postgis/Dockerfile`: `postgres:16` plus the PGDG PostGIS 3.6 package, linux/amd64 and linux/arm64), because the official `postgis/postgis` image has no arm64 build. `.github/workflows/postgis-image.yml` publishes it when `infra/postgis/**` changes on `master` (pull requests build amd64 only); the box needs the GHCR login of section 16 to pull it. Dev (`infra/docker-compose.dev.yml`) uses the official `postgis/postgis:16-3.6`, the same PostGIS minor. A dev database created on 3.4 needs `SELECT postgis_extensions_upgrade();` once in each database after the image change. The data of the x86 box is PostGIS 3.4.3 and restores into 3.6 from a dump (proved by `restore-test.sh` and a spatial query, see the A1 migration log). The first publish ran on the merge of PR #395 (2026-11-02): the tag is an index with amd64 and arm64, and the A1 box pulls it (the rehearsal ran on a local build of the same Dockerfile first).
5. **Passwords (INFRA-14).** `start-stack.sh` needs `~/web/stack.env` and the production override refuses to start a service whose password is missing. On a new box, after step 1, run `rotate-credentials.sh postgres` and `rotate-credentials.sh rabbitmq` (section 18) so the app, chat and Keycloak get their own roles and RabbitMQ gets its own user; Keycloak will not start before its role exists.

## 6. Keycloak

All run on the box, in this order. Each script's header has the exact `docker exec -i` form. Secrets go in as `printf '%s\n' "$(cat ~/.file)" … | docker exec -i …`, which works whether or not the file ends in a newline; the scripts refuse empty input.

1. **Admin password** (before anything is public). From a real terminal: `scp set-admin-pw.sh`, then `ssh -t -i <key> ubuntu@<ip> ./set-admin-pw.sh`; type your own password (12 or more characters) twice. It changes it in Keycloak, verifies by logging in, writes `~/.kc-admin-pw` and prints the stored length (it must equal what you typed). The `!` prefix inside Claude Code has no TTY and cannot run it.
2. `set-web-client-uris.sh`: production redirect URI and web origin for the client `sportconnect-web` (replaces the localhost entries).
3. `set-credentials-client-secret.sh`: puts `~/.cred-secret` on the client `sportconnect-credentials`; it must print "read-back matches the new secret".
4. `set-smtp.sh`: the realm's own mail (reset, verification, account-link) through Brevo, section 7.
5. The realm scripts that matter in production, from your computer **through the SSH tunnel** (`ssh -L 18081:127.0.0.1:8081 -i <key> ubuntu@<ip>`, then `KEYCLOAK_URL=http://localhost:18081`, admin password read from the box): the Google provider (`infra/scripts/apply-realm-google-provider.sh` with the real Google client), phone rules, normalized email, link-existing-account, Google picture and email-verified, edit-username, password policy and credentials client, as listed in `CLAUDE.md`. Only the Google provider was applied on the live realm so far; the others were not rerun on the production realm (INFRA-14 owns this; check each with its `verify-*.mjs` before trusting it).
6. `set-master-frontend-url.sh`: lets the admin console work through the tunnel (`http://localhost:18081/admin/`).

**INFRA-14: one script for steps 2, 3, 4 and 6.** `apply-realm-production.sh apply` runs those four scripts with the values of `server.env` (redirect URI from `PUBLIC_URL`, the credentials secret, the Brevo SMTP settings, the master `frontendUrl`), deletes the dev Swagger client `sportconnect-swagger` and sets `editUsernameAllowed`; `apply-realm-production.sh check` is read-only, prints `ok` or `FAIL` per setting (never a secret) and reports whether registration is open and whether the Google provider is enabled. Both read the admin password from `~/.kc-admin-pw` (step 1). The production values are applied through the admin API and are **not mirrored in the realm file**, because that file also seeds the dev Keycloak and must keep the dev values (a recorded deviation from "mirror every realm change"); the script is the one place that says what production looks like. Ran against a throwaway Keycloak with the committed realm file: `check` failed on all production settings, `apply` set them, `check` then passed, a second `apply` changed nothing. **Not run on the live realm yet** (section 18).

## 7. Email (Brevo)

1. Brevo free plan (about 300 emails a day, SMTP relay included; Oracle blocks port 25, so use 587). In Brevo: SMTP & API → create an **SMTP key**; note the **SMTP login** (not the key). Authenticate the sender domain `yoursport.vn` (SPF, DKIM, DMARC records at iNET) so mail reaches inboxes; the exact Brevo screens were not recorded, follow Brevo's current domain-authentication page.
2. Put the key and login in `~/.brevo-smtp-key` and `~/.brevo-smtp-user` (hidden input). Run `set-smtp.sh` (host `smtp-relay.brevo.com`, port 587, from `noreply@yoursport.vn`, STARTTLS).
3. In `~/web/server.env` set `MAIL_USERNAME` and `MAIL_PASSWORD`, and recreate the server and chat containers. Health no longer shows mail (INFRA-11: a mail outage must not mark the server down or roll back a deploy), so the only proof is a delivered message: sign in with a new account (the welcome email, sent by the server) and use reset-password on the login page (Keycloak's email); the reset link must open `https://yoursport.vn`. Checked 2026-11-02 on the box, owner's word: both emails arrived and the reset link works.
4. Rotate the key whenever it has been seen anywhere other than the box. Status: the current key was pasted in chat earlier and is deliberately not rotated yet (INFRA-12).

## 8. Backups

1. `bash ~/sportconnect/infra/oracle/scripts/install-backup.sh`: installs the OCI CLI (pipx), creates `/etc/sportconnect/backup.env` (set `BACKUP_BUCKET=sportconnect-backups`) and enables `sportconnect-backup.timer` (19:00 UTC = 02:00 Vietnam).
2. First run by hand: `sudo systemctl start sportconnect-backup`, then `journalctl -u sportconnect-backup -n 30 --no-pager`. Expect four objects under `<UTC stamp>/`: `sportconnect_dev`, `sportconnect_chat_dev`, `keycloak_dev` dumps and the `caddy_data` archive.
3. Prove the restore: `BACKUP_BUCKET=sportconnect-backups bash ~/sportconnect/infra/oracle/scripts/restore-test.sh`. It restores the newest set into scratch databases, checks a key table in each, and drops them. Repeat after any change to the Postgres image or its extensions.
4. Check the schedule with `systemctl list-timers sportconnect-backup.timer`. The timer's own scheduled run and the 7-day lifecycle deletion have not been observed yet.
5. **A rehearsal box must not run the timer.** `install-backup.sh` enables the nightly timer; on a second box that is built while the first still serves, the timer would write the rehearsal's (restored or empty) databases into the same bucket, and a restore of "the newest set" would pick them. Install only the OCI CLI (`sudo apt-get install -y pipx; pipx install oci-cli`) and install the timer at the cutover, after the old box's last backup. (Followed on the A1 box, 2026-11-02.)

## 9. Restoring onto a new box (rebuild with data)

Use when the box is lost or rebuilt and the data must come along. Order matters.

1. Do sections 1 to 6.1 and 6.2 to 6.3 as for a new box (new instance, dynamic group OCID, bundle, secrets, `start-stack.sh`, `sportconnect-deploy`, admin password).
2. Get the newest set from the bucket (`oci os object list/get` with the instance principal, or run `restore-test.sh` to see the commands it uses).
3. Stop `sc-server`, `sc-chat` and Keycloak. For each of the three databases: `DROP DATABASE … WITH (FORCE)`, `CREATE DATABASE`, `pg_restore --no-owner --exit-on-error`. Restore `caddy_data` by `tar xzf` into the volume. Start Keycloak, then server, then chat. Delete the downloaded files (they hold user data). **INFRA-14:** `restore-from-bucket.sh` does all of this, and then runs `rotate-credentials.sh postgres`: the dumps hold no roles and no owners (`pg_dump` of one database, `--no-owner`), so the roles `sc_app`, `sc_chat` and `sc_keycloak` and the ownership are made again from `stack.env`. It needs `stack.env` (found through `ENV_DIR`, so run `eval "$(bash fetch-secrets.sh)"` first, section 18) and warns when it is missing. Not run on a fresh box yet.
4. **The Keycloak restore reverts the master admin password and the realm settings that were applied by API only.** Re-run `set-admin-pw.sh` (or reset to your password), `set-credentials-client-secret.sh`, `set-master-frontend-url.sh`; check the web redirect URI, Google provider and SMTP are still production values.
5. Check (section 10), then switch DNS.

This exact sequence ran on 2026-10-27 (sandbox to new box, 2 accounts); a restore from the **bucket** onto a fresh box has been run for the test databases only (scratch restore), not as a full rebuild.

## 10. Check from outside Oracle

From your computer, with real DNS:

**Checking a box before DNS points at it (rehearsal or cutover):** `curl --resolve yoursport.vn:443:<box IP> --resolve www.yoursport.vn:443:<box IP> --resolve auth.yoursport.vn:443:<box IP> https://yoursport.vn/…` sends the real host name to the new box with the real certificate, so the whole list below can be run against it while the old box still serves. Run the same request against the live site and compare status and size (done for the A1 box on 2026-11-02: 12 of 12 identical).

| URL | Expected |
|---|---|
| `https://yoursport.vn/` | 200 (client) |
| `https://www.yoursport.vn/` | 301 to the apex |
| `https://yoursport.vn/api/reference/countries` | 200, JSON |
| `https://yoursport.vn/api/chat/healthz` | 200 |
| `https://yoursport.vn/api/users/me` | 401 |
| `https://auth.yoursport.vn/` | 302 to `/login` |
| `https://auth.yoursport.vn/realms/sportconnect/.well-known/openid-configuration` | 200 |
| `https://auth.yoursport.vn/admin/` and `/realms/master/…` | **403** |
| `/actuator/health`, `/swagger-ui.html` on the main host | the client's `index.html` (not exposed) |
| `/internal/x` (and any `/internal/**`) on the main host | **404** from Caddy (INFRA-9) |

Also: a trusted Let's Encrypt certificate on all three names; the login page shows the Google button; sign in with a password and with Google; a password-reset email arrives.

### Proxy and WebSockets (INFRA-7)

`infra/oracle/Caddyfile` is the production proxy config (`start-stack.sh` mounts the copy in `~/web`). Caddy upgrades WebSockets by itself; there is nothing to add per route. Two sockets pass through it:

- **Chat:** `wss://yoursport.vn/api/chat/conversations/{id}/ws?token=…` (prefix stripped, to `sc-chat:8090`). The origin must equal `CHAT_CORS_ALLOWED_ORIGIN` in `chat.env`. **The token is in the URL, so never add a `log` directive to the Caddyfile that records the URI or query string**, it would write live access tokens to disk. There is none today.
- **STOMP (notifications):** `wss://yoursport.vn/ws` (to `sc-server:8080`). The token is in the STOMP CONNECT frame. Origins come from `CORS_ORIGINS` in `server.env`; the messages go through RabbitMQ's STOMP relay (`STOMP_RELAY_HOST=rabbitmq`, port 61613, plugin `rabbitmq_stomp`).

Checks (run on 2026-10-30, INFRA-7), from your computer:

1. The upgrade handshake, no sign-in needed: `curl -s -o /dev/null -D - --max-time 5 -H Connection:Upgrade -H Upgrade:websocket -H Sec-WebSocket-Version:13 -H Sec-WebSocket-Key:dGhlIHNhbXBsZSBub25jZQ== -H "Origin: https://yoursport.vn" https://yoursport.vn/ws` prints `101 Switching Protocols`; the same with `Origin: https://evil.example` prints `403`; the same against `/api/chat/conversations/1/ws` without a token prints `401` (that is the chat service answering, so the route and the prefix strip work).
2. Live, with two signed-in users in one conversation (DevTools, Network, filter WS): the chat row stays `101` and a message from the other user shows up with no refresh; the `/ws` row shows `CONNECTED`, the subscription and a pushed notification that raises the bell with no refresh; leave it idle for 2 minutes and send one more message.
3. On the box, read-only: the Caddyfile without comment lines is the repo's (`grep -v '^[[:space:]]*#' ~/web/Caddyfile | tr -d '\r' | sha256sum` equals the same command on the repo file), the two origin lines in the env files read `https://yoursport.vn`, `rabbitmq-plugins list -E -m` in the RabbitMQ container lists `rabbitmq_stomp`, and `grep -n -i '^[[:space:]]*log' ~/web/Caddyfile` finds nothing.

### Changing the Caddyfile and the isolation check (INFRA-9)

`infra/oracle/Caddyfile` has a rule that refuses `/internal/*` with a 404 before any other rule. It protects the server's service-to-service endpoints (chat's cold-start bootstrap reads them over the Compose network, never through Caddy); the application's shared secret stays as a second layer. Do not move that block below another rule.

**Changing the Caddyfile on the box.** `~/web/Caddyfile` is bind-mounted as a single file into `sc-caddy`, so it must be written **in place** (same inode); `mv`, an editor that replaces the file, or `scp` straight onto it can leave the container reading the old file.

1. On your computer, from the repo root (the working copy may be CRLF): `tr -d '\r' < infra/oracle/Caddyfile > /tmp/Caddyfile.new && scp /tmp/Caddyfile.new sc-box:~/web/Caddyfile.new`
2. On the box, validate the new file without touching the live one: `docker run --rm -v ~/web/Caddyfile.new:/etc/caddy/Caddyfile:ro caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile 2>&1 | tail -1` must print `Valid configuration`.
3. Keep the old file and write the new one in place: `cp ~/web/Caddyfile ~/web/Caddyfile.prev && cat ~/web/Caddyfile.new > ~/web/Caddyfile`
4. Reload without downtime: `docker exec sc-caddy caddy reload --config /etc/caddy/Caddyfile` (it prints nothing on success; a rejected config leaves the old one serving). Certificates are untouched.
5. Compare: `grep -v '^[[:space:]]*#' ~/web/Caddyfile | tr -d '\r' | sha256sum` must equal the same command on the repo file (after INFRA-9: `7cd9ff420cae9e2564c3ccf15ae494fc9934bf60193c0998cbd22da794c93c3c`).
6. Run the isolation check below, then `rm ~/web/Caddyfile.new` (and `/tmp/Caddyfile.new` on your computer). Keep `Caddyfile.prev`.

Rollback: `cat ~/web/Caddyfile.prev > ~/web/Caddyfile`, then step 4. If a reload seems to do nothing, recreate `sc-caddy` by rerunning `start-stack.sh` (the certificates in the `caddy_data` volume are kept). The `caddy:2-alpine` used for the validate may be a different Caddy version from the one in `sc-caddy`; the directives used here are stable across Caddy 2.

**Isolation check (from your computer, not the box):** `bash infra/scripts/verify-internal-isolation.sh` (host defaults to `yoursport.vn`). It must end with `all checks passed`: every `/internal/**` variant (three sync endpoints, case, `/api/../`, `/ws/../`, `/images/../`, a POST) answers 404; `/actuator/*`, Swagger and `api-docs` return the client page; `/api/internal/…` gives the application's 401; the auth host's `/internal` gives 404; and ports 8080, 8090, 8081, 5432, 6379, 5672, 15672, 61613, 25 and 8025 are closed or filtered on the public address. It sends no secret. `EXPECT_INTERNAL_CODE=200` checks a Caddyfile from before INFRA-9; `CHECK_PORTS=0` skips the port checks.

### Swagger and the API catalogue (INFRA-10)

The `prod` profile does not serve the Swagger UI or the OpenAPI document (`springdoc.swagger-ui.enabled` and `springdoc.api-docs.enabled` are `false` in `application-prod.yml`; dev keeps them). The server no longer names those paths as public, so an anonymous request to `/swagger-ui.html`, `/api-docs` or `/v3/api-docs` gets the same 401 as any unknown path. From the internet they already answered the client page, because Caddy has no rule for them; the isolation check keeps verifying that.

Check on the box after a deploy of this change (run on 2026-11-01, server `0.1.1`): `docker exec sc-caddy wget -S -O /dev/null http://sc-server:8080/api-docs 2>&1 | grep -E 'HTTP/|error'` must show `HTTP/1.1 401` (and `wget: server returned error: HTTP/1.1 401`); the same for `/swagger-ui.html`. A server from before the change should show `200` or, for the UI, a redirect (not observed). The `grep` matters: BusyBox `wget -S` prints `Connecting to …` first, so `head -1` hides the status. There is no Swagger on the box by design; to look at the API, run the server locally in the dev profile.

## 11. The admin console

The public host blocks `/admin` and the master realm. `ssh -L 18081:127.0.0.1:8081 -i <key> ubuntu@<ip>` (leave it open), then `http://localhost:18081/admin/master/console/`, user `admin`. This needs `KC_HOSTNAME_ADMIN` (in `kc-prod.override.yml`) and step 6.6; admin scripts must log in through the tunnel (or `kcadm` inside the container), never through the public host.

## 12. Gotchas

- Oracle's Ubuntu image blocks 80 and 443 in iptables even when the security list allows them; Docker-published ports skip those rules, so test a real listener.
- A new certificate name is probed by scanners within seconds: block the Keycloak admin paths in the same change that publishes it.
- A password pasted into a hidden `read` is stored with the terminal's invisible paste markers unless the script strips them; use `set-admin-pw.sh`, never a hand-made file.
- Keycloak's read-back of `smtpServer` and `--fields attributes` hides values; read the whole object to see them.
- Do not delete `caddy_data`.
- Container names matter: Caddy reaches `keycloak`, `sc-server` and `sc-chat` by name on `sportconnect-dev_default`.
- Chat needs `REDIS_ADDR`, its schema is not created automatically, and it exits if it starts before the server is ready (`sportconnect-deploy` starts the server first and waits for it).
- If SSH refuses a key that worked before, nothing is known about the cause (a fresh box did it once, INFRA-3 log row 15). Look at the instance console history and boot log, and whether `authorized_keys` changed, before building another.
- `curl` and Git Bash rewrite a leading `/path` into `C:/Program Files/Git/path`; use PowerShell or forward-slash Windows paths. The `!` prefix has no TTY.

## 13. What is still not production-grade (decisions and gaps)

INFRA-14 replaced the dev passwords (section 18, **not run on the box yet**: until it is, the box still has Postgres password `sa` with one superuser shared by the app, chat and Keycloak, RabbitMQ `guest/guest` and Redis without a password, all loopback-only). What remains after it, on purpose or not yet done:

- **Registration is open (decision, INFRA-14).** Anyone can create an account on the Keycloak page and is signed in at once, because email verification is an optional step and not a gate (A33). The only brake is Brevo's free quota, which limits welcome mails and not sign-ups. Closing it is a realm setting (`registrationAllowed`) and would need a script and a realm-file change; it was left out of INFRA-14 and is not filed as a ticket.
- **The Brevo SMTP key is not rotated** (owner's decision, INFRA-3 row 23); an older key sits in an old transcript and is treated as exposed. Mail depends on Brevo's free quota.
- **The committed realm file keeps the dev secret** of the credentials client and the dev Swagger client; production gets neither (`apply-realm-production.sh`, section 6).
- **Facebook and Zalo sign-in** are not set up (only Google); a ticket is filed when those apps exist.
- **No monitoring or alerting; a single box with no redundancy.**

## 14. Tearing a box down

Terminate the instance and tick "permanently delete the boot volume"; remove any reserved public IP; revoke the Brevo key if the whole deployment is ending; delete DNS records only if the domain should stop pointing at Oracle. Update the dynamic group rule if another box takes over.

## 15. The server, client and chat images and releases (INFRA-4, INFRA-5, INFRA-8)

The server image is built from `server/Dockerfile` and published to `ghcr.io/mr-mittt/sportconnect-server` by `.github/workflows/server-image.yml`. The box deploys it with `sportconnect-deploy` (section 16, INFRA-6; first deploy on 2026-10-30). What exists:

- **Version:** one monolith version, `version` in the root `gradle.properties` (`0.0.0` is the placeholder before the first release). Never edit it by hand.
- **An ordinary merge to `master` builds and pushes nothing** (changed 2026-11-02, INFRA-12, to save CI minutes: the arm64 build runs under emulation, and no one deploys an ordinary build). Only a release merge builds and pushes. A pull request that touches the server paths still builds the image (amd64, nothing pushed) so a broken Dockerfile fails before the merge. Consequence: there is no `:edge` of the latest master and no new `sha-<short>` image to promote between releases; the old ones age out under the retention rule.
- **Cut a release:** `/release` in Claude Code does the steps below (branch, bump, commit, push; `/release patch`, `/release server 1.0.0`; no argument = minor for every versioned component) and hands over the PR link. By hand: `git switch -c chore/server-<X.Y.Z> master`, `infra/scripts/server-version.sh bump` (raises the minor version; `patch`, `major` or an explicit `X.Y.Z` also work, and it refuses a repeat, a downgrade or anything not above the latest `server-v*` tag), commit `chore(release): server X.Y.Z`, open the PR, merge it when `server-ci` is green. On the merge the workflow sees that the tag `server-vX.Y.Z` does not exist, pushes `:X.Y.Z` and `:latest` (plus `:edge` and `:sha-<short>`) and creates the tag last. Nothing to click in GitHub. Every release, a patch included, is a bump PR. (Not run yet: first release after INFRA-4 merges, INFRA-15.)
- **A release whose push failed:** no tag was created, so Actions, server-image, "Run workflow" on `master` (no inputs) releases it.
- **CPU architecture (INFRA-12):** a release builds **both** `linux/amd64` and `linux/arm64` into the same tags (one multi-arch tag: each box pulls the build for its own CPU, so the A1 box and an x86 box both follow `:prod`). A pull request builds `linux/amd64` only (native, fast, nothing pushed). A manual run has a `platforms` choice (both by default). The earlier x86 box (`VM.Standard.E3.Flex`) is the reference shape, kept in this guide and the INFRA-12 findings. **To rebuild a release** (for example to add a platform): delete the remote tag (`git push origin :refs/tags/server-vX.Y.Z`, likewise `client-v` and `chat-v`), run the three workflows by hand on `master` (a missing tag makes the run a release again: it pushes `:X.Y.Z` and `:latest`, and recreates the tag), then Promote again. This works for the latest released version of a component (the version check refuses a lower one). A run with one platform replaces what the tags point to, so keep the default unless you mean it. (The release builds ran on 2026-11-02: client 6 m 28 s, chat 5 m 54 s, server 11 m 14 s for both platforms, owner's word; the rebuild-a-release procedure ran on 2026-11-02 on chat, INFRA-15: tag deleted, run by hand on `master` with `linux/arm64` (the tag then held one platform), again with both platforms (an index with both), then Promote of the rebuilt release; the tag moved to the commit of the rebuild.)
- **Which version is an image or container?** `docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.version" }}' <image-or-container>`, or the first log line (`Starting SportConnectApplication v<version>`). `0.1.0` is the release; `0.1.0+abc1234` is a later master build.
- **Pulling a private image on the box** needs a classic token with only `read:packages`; the login is described in section 16 (done on the box on 2026-10-30).
- **Retention:** every release and `latest`/`edge` are kept, plus the newest 10 `sha-*` builds; older ones are deleted by the workflow. (Not run yet; whether the workflow's token may delete versions of a user-owned package is unverified.)

### The client image (INFRA-5)

Same scheme as the server, with its own version and package: `client/Dockerfile` -> `ghcr.io/mr-mittt/sportconnect-client`, built by `.github/workflows/client-image.yml`. The box deploys it with `sportconnect-deploy` (section 16).

- **Version:** `version` in `client/package.json` (`0.0.0` is the placeholder). Tags `client-vX.Y.Z`. Never edit it by hand: `/release client` (or `/release`, which bumps the server, the client and chat together) or `infra/scripts/client-version.sh bump [minor|patch|major|X.Y.Z]`.
- **Release:** merge the bump PR (when `client-ci` is green). `client-image` pushes `:X.Y.Z`, `:latest`, `:edge`, `:sha-<short>` and creates the tag last; other client merges push `:sha-<short>` and `:edge`. A failed release is re-run with Actions, client-image, "Run workflow" on `master`. Retention is the server's (every release, `latest`, `edge`, newest 10 `sha-*`).
- **The image holds the files only.** `docker run --rm -v ~/web/dist:/srv ghcr.io/mr-mittt/sportconnect-client@<digest>` replaces the contents of `~/web/dist`; Caddy has that folder mounted on `/srv` read-only and picks the new files up without a restart or a re-mount (`sportconnect-deploy` does this step). The Keycloak URL is baked in (`https://auth.yoursport.vn`), so one image is for one environment; to build one by hand: `docker build -f client/Dockerfile --build-arg VITE_KEYCLOAK_URL=<url> client`.
- (Verified on GitHub (INFRA-15, 2026-10-28 to 2026-11-02): the first push, release and tag, the pull-request runs (built, nothing pushed, no GHCR login), the version and path filters, the refusal of a run from any branch but `master`, and the rebuild of a release. **Not proven:** the retention step's deletion, which needs more than 10 `sha-` builds (only releases push them now); read the prune step's log of the first release that finds more. The pull and the file step on the box ran on 2026-10-30, INFRA-6.)

### The chat image (INFRA-8)

Same scheme as the server and the client, with its own version and package: `services/chat/Dockerfile` -> `ghcr.io/mr-mittt/sportconnect-chat`, built by `.github/workflows/chat-image.yml`. The box deploys it with `sportconnect-deploy` (section 16).

- **Version:** `services/chat/VERSION` (`0.0.0` is the placeholder). Tags `chat-vX.Y.Z`. Never edit it by hand: `/release chat` (or `/release`, which bumps all three) or `infra/scripts/chat-version.sh bump [minor|patch|major|X.Y.Z]`.
- **Release:** merge the bump PR (when `chat-ci` is green). `chat-image` pushes `:X.Y.Z`, `:latest`, `:edge`, `:sha-<short>` and creates the tag last; other chat merges push `:sha-<short>` and `:edge`. A failed release is re-run with Actions, chat-image, "Run workflow" on `master`. Retention is the server's (every release, `latest`, `edge`, newest 10 `sha-*`).
- **The image:** a static Go binary on `distroless/static-debian12:nonroot` (UID 65532, port 8090, 5 MB), environment as in `infra/oracle/chat.env.example`. It has no shell, so no in-image health check; `GET /healthz` answers 200 and is probed from outside. The first start asks the server to sync, so start the server first.
- **Which version is running?** The `org.opencontainers.image.version` label, or the `version` field of the `chat service listening` log line.
- **The Go version of the build** is read from `go.mod` by the workflow; the Dockerfile's `GO_VERSION` default only serves a plain local `docker build` and should equal the `go` line of `go.mod`.
- (Verified on GitHub (INFRA-15, 2026-10-28 to 2026-11-02): the first push, release and tag, the pull-request runs (built, nothing pushed, no GHCR login), the version and path filters, the refusal of a run from any branch but `master`, and the rebuild of a release. **Not proven:** the retention step's deletion, which needs more than 10 `sha-` builds (only releases push them now); read the prune step's log of the first release that finds more. The pull and start on the box ran on 2026-10-30, INFRA-6, including the first start of the chat image that migrates itself, CHAT-22.)

## 16. Promoting and deploying (INFRA-6)

The box runs what the `prod` tag of each image points at. Two steps, both by hand, nothing automatic: **promote** (GitHub: point `prod` at a release) and **deploy** (the box: pull what `prod` points at and restart). Run for real on 2026-10-30 (INFRA-15): the promote of the three components, the GHCR login, the first deploy over the sandbox containers, the hardened flags on the real images and the up-to-date run. **Not run yet:** the failure path on the box (a deliberate failure and the restore; it needs a second version to deploy, so it waits for the next release) and the Caddy probe failing case. The decisions behind it were tested locally with a throwaway registry and stand-in containers.

### Once: GitHub

1. Repository **Settings, Environments, New environment**, name exactly `production`.
2. Tick **Required reviewers**, add yourself, **Save protection rules**. Leave **Prevent self-review** off (you are the only deployer). On a private repository this option needs a paid GitHub plan; if it is missing, say so before relying on the gate.
3. **Deployment branches and tags**: selected branches, add `master`.
4. No wait timer, no environment secrets.

### Promote (GitHub)

1. Release first (section 15): merge the bump PR, check the image workflow's Summary says `release: true`.
2. **Actions, promote, Run workflow** (from `master`): choose the component (`server`, `client` or `chat`) and the version (`X.Y.Z`, or `sha-<hex>` for a test build). `edge`, `latest` and `prod` are refused. **Skip CI check** only if you accept that the CI of that code failed (the summary records it).
3. The first job writes the summary the reviewer reads: the version and commit on `prod` now and the new ones, and the CI result for that code (the newest `master` run of `<component>-ci` on the image's commit or an ancestor; the CI workflows are path-filtered, so the release commit often has no run of its own). A failed CI run, an image that does not exist, or an image **older** than the one on `prod` stops the run here. Going back to an older version is blocked until INFRA-17 (the database schema may not fit an older release).
4. The second job is named `Retag <component> <now> -> <new>` and waits for you: **Review deployments, Approve**. It then retags the image as `prod` (the same image by digest, nothing rebuilt): the manifest is copied byte for byte through the registry API, so `prod` carries exactly the digest in the summary. A failed digest check at the end of this job means `prod` was moved to something else: do not deploy, read the job log. (`docker buildx imagetools create` is not used: given a single-platform image it writes a new manifest list with a different digest, found by the first real promote on 2026-10-29.)

To run CI again for a release whose result is missing or expired: Actions, the CI workflow, Run workflow, choose the tag (for example `server-v0.2.0`).

### Once: the box

1. Copy the repo files (section 3, step 3), including `infra/oracle/scripts/sportconnect-deploy.sh`, check with `file` that the scripts have LF line endings (CRLF breaks them on Linux), and install the command: `sudo install -m 0755 ~/sportconnect/infra/oracle/scripts/sportconnect-deploy.sh /usr/local/bin/sportconnect-deploy`. Re-run it after every change to the script; `sportconnect-deploy --version` prints the checksum of the installed copy (compare with `sha256sum` of the repo file).
2. Log in to GHCR as `ubuntu` with a classic token that has **only `read:packages`**, read from stdin so it never lands in a command line or history: `read -rs T; printf '%s' "$T" | docker login ghcr.io -u <github user> --password-stdin; unset T`. The login is kept in `~/.docker/config.json` (mode 600). A classic token has an expiry: when it passes, `sportconnect-deploy` fails on the registry read or the pull; make a new token and run the same login line again (INFRA-14 moves this into the secrets store).
3. `~/web/server.env`, `~/web/chat.env` (section 4) and the folder `~/web/dist` exist, and the stack is started (`start-stack.sh`, section 5). The command checks all of this and says what is missing. **INFRA-14:** with the secrets store the two env files are not in `~/web`. In the same shell, before `sportconnect-deploy`, run `eval "$(bash ~/sportconnect/infra/oracle/scripts/fetch-secrets.sh)"`; it writes them to tmpfs and sets `ENV_DIR`, which `sportconnect-deploy` reads (default `~/web`). Tmpfs is empty after a reboot, so fetch again first. `sportconnect-deploy --recreate=server,chat` starts those containers again from the image they already run (an env file is read only when a container is created); the same pull, health wait and restore on failure apply. Written and checked for syntax and matching only; not run on the box yet.

### Deploy (the box)

SSH in as `ubuntu` and run `sportconnect-deploy` (no `sudo`). It asks GHCR what `prod` points at for the server, chat and client images, compares with what runs, and prints the plan:

```
component running                    prod                   action
server   0.1.0                       0.2.0                  DEPLOY
chat     0.1.0                       0.1.0                  unchanged
client   0.1.0                       0.1.0                  unchanged
Deploy server? [y/N]
```

`--plan` only shows it, `--yes` skips the question. It pulls the changed images first (a failed pull touches nothing), then deploys in this order: **server** (waits for the container's health check), **chat** (waits for `GET /healthz`, probed from the host at the container's address because the image has no shell), **client** (the files are copied aside, the image is run once into `~/web/dist`; Caddy reads them per request, no restart). The containers run with `--cap-drop ALL`, `no-new-privileges` and a read-only root; the server gets `/tmp` as tmpfs and the volume `sc-server-logs` for `/var/log/sportconnect`.

- **Any failure puts back everything that run changed**, in reverse order (the old container is kept as `sc-<name>-prev` and renamed back; the old client files are in `~/web/dist.prev`), then prints a report: what was changed, what failed, the reason and a suggestion. If putting something back fails too, the report names the component in an unknown state and the command to fix it by hand.
- **No `prod` image for a component** (never promoted, or the token cannot read it): nothing is touched and the message says what to check.
- **A prod version lower than the running one** is refused (INFRA-17).
- **One run at a time** (a lock file in `~/web`). Every run is appended to `~/web/deploy.log`.
- The server runs its Liquibase migrations at start-up. A container put back after a failure does **not** undo a migration the new version already ran; write migrations so the previous release still works (add first, remove a release later) and see INFRA-17.
- The first run on a box that still has the sandbox's locally built `sc-server` and `sc-chat` shows their version as `unknown (local build)` and replaces them; the old ones are the restore target for that run.
- **Chat's schema:** the chat image carries its migrations and applies them when it starts (CHAT-22), like the server's Liquibase. The box's chat database was built by hand with `psql`, so it has the tables but no `schema_migrations` record: the **first start of the first chat image that has CHAT-22 rebuilds it**. Migration `000001` drops the chat tables (messages, conversations, participants, the sync caches, `sync_state`) and creates them again, so the box's chat history is lost (it is test data, accepted); the cold-start bootstrap refills the caches from the server. Nothing to seed. A brand new box has no chat tables, so nothing is dropped. Afterwards check: `docker exec sportconnect-dev-postgres-1 psql -U postgres -d sportconnect_chat_dev -c "select * from schema_migrations" -c "\d chat_messages"` shows `4 | f` and the columns `edited_at` and `deleted_at`. `CHAT_MIGRATE_ON_START=false` in `chat.env` turns the migration off. A failed migration makes the container exit, the health probe fails and the deploy puts the previous container back; the database stays marked dirty until fixed by hand. (Run on the box 2026-10-30: `schema_migrations` `4 | f`, `edited_at` and `deleted_at` present, the log shows `migrations applied` version 4.)

### After a deploy: the checks (run on 2026-10-30, INFRA-15)

Before the first deploy (both read-only):

1. **The box can read the registry.** `docker buildx imagetools inspect ghcr.io/mr-mittt/sportconnect-chat:prod --format '{{.Manifest.Digest}}'` prints the digest that the promote's "Move prod" log ended with. A "denied" or "unauthorized" means the login (step 2 above) or the token's `read:packages` is wrong.
2. **The plan.** `sportconnect-deploy --plan` lists the three components. On a box with the sandbox's own builds the running column shows `unknown (local build)` or the base image's label (the sandbox server showed `26.04`, the Ubuntu release label of its base image); every row says `DEPLOY`.

After the deploy, on the box:

3. **Containers.** `docker ps --format '{{.Names}} {{.Image}} {{.Status}}' | grep -E 'sc-(server|chat)'`: `sc-server` is `Up … (healthy)`, `sc-chat` is `Up` (the chat image has no health check of its own). The image column equals the first 12 characters of the digest that was promoted (it did on 2026-10-30).
4. **Hardened flags on the real images.** `docker inspect sc-server sc-chat --format '{{.Name}} {{.HostConfig.CapDrop}} {{.HostConfig.SecurityOpt}} {{.HostConfig.ReadonlyRootfs}}'` prints `[ALL] [no-new-privileges] true` for both, and both are running.
5. **Chat schema.** `docker exec sportconnect-dev-postgres-1 psql -U postgres -d sportconnect_chat_dev -c "select * from schema_migrations" -c "\d chat_messages"`: `4 | f`, and the columns `edited_at` and `deleted_at`.
6. **Chat log.** `docker logs sc-chat 2>&1 | head -8`: `migrations applied` (`schema is up to date` on a later start) with version 4, then `chat service listening` with the promoted version, and no `ERROR` line.
7. **Deploy log.** `tail -20 ~/web/deploy.log`: a `START` line and an `OK` line for the run, no restore.
8. **Up to date.** `sportconnect-deploy --plan` again: all rows `unchanged` with real versions, and "everything is up to date".

From your computer:

9. **The outside checks of section 10**, then sign in with a test user and send a chat message.

**The failure path (run on 2026-11-02, INFRA-15, on the A1 box).** To test it on a component that has something to deploy, copy `chat.env` aside (`cp -p chat.env chat.env.good`), replace its `CHAT_DATABASE_URL` line with a host that refuses connections (`sed`, never print the file), run `sportconnect-deploy --yes`, and check: the report names chat as failed with the log excerpt and says `every component is back on the version it had before this run`; `docker ps -a` shows one `sc-chat` and no `sc-chat-prev`, and `docker inspect` gives the same container id and image as before the run (only the start time is new); `deploy.log` has `FAILED+RESTORED`. Then put the file back (`mv -f chat.env.good chat.env`, `chmod 600`), deploy again, and `--plan` reads "everything is up to date". Note: the failure reason said "did not answer within 60s" and not "the container stopped", because the container restarts by itself; the log lines in the reason carry the real cause. The deploy decides by digest, not by the version label, so a rebuilt release with the same version still reads `DEPLOY` after a Promote.

**Updating the command later.** To change only the script, no bundle is needed: `scp` the one file to the box, `sudo install -m 0755 ~/sportconnect-deploy.sh /usr/local/bin/sportconnect-deploy`, then `sportconnect-deploy --version` must equal `sha256sum infra/oracle/scripts/sportconnect-deploy.sh` on your computer. Check the repo file has LF line endings first (`file`).

## 17. The standard box switch: moving production to another box (INFRA-12)

**Two variants.** *Full* (users exist, no data may be lost): every step below, including the freeze and the final backup (steps 1 to 4). *Quick* (no end users yet, the data since the last nightly backup may be dropped; the variant used for the move to the A1 box on 2026-11-02, steps 5 to 10 run that day: log rows 21 to 25, DNS TTL 300 s, the data since the 2026-11-01 19:02 UTC backup dropped): **skip steps 1 to 4**, because the new box already holds the newest nightly set from its rehearsal (log row 13), and start at step 5. In the quick variant the old box's timer must still be disabled at the switch (step 3 is not optional), and the data written on the old box after that backup is not carried over (say so in the log: what the date of the backup was, and that nobody but the owner used the site since).

Written 2026-11-02 for the move from the x86 box (`sc-box`, amd64) to the A1 box (`sc-a1`, arm64); **none of it has been run yet** except where a step says so. It is the same for any other box: "old" is the box serving now, "new" is the box that takes over. Everything that can be done before the switch is in the preparation list, so the window in which users cannot write is short.

**Preparation (days before; nothing here affects users)**

1. The new box is built (sections 1 to 5, 9 and 16) and has run the rehearsal. For the A1 box this is done: the stack runs, the same three versions are deployed on both boxes, 12 of 12 requests match the live site through `curl --resolve` (section 10), the load test passed (INFRA-12 ticket, "Point 4 on A1"). `sportconnect-deploy --plan` on both boxes must say "unchanged" for every component.
2. **Lower the DNS TTL** of the three records at iNET (section 2) to 300 seconds at least one old-TTL period before the day, so the switch spreads in minutes. (The current TTL has not been looked up; write it down here: ____.)
3. **Decide the time** (the window below is a few minutes, not timed yet) and tell the users if there are any beyond the owner.
4. The GHCR login, the dynamic group (both OCIDs in the rule, section 1 step 6), the OCI CLI (section 8 item 5) and `~/web/server.env`/`chat.env` exist on the new box. `restore-from-bucket.sh` is on it (`~/sportconnect/infra/oracle/scripts/`; strip CR if it came from Windows, section 3). **INFRA-14:** with the secrets store the env files come from `fetch-secrets.sh` (`VAULT_OCID` in `/etc/sportconnect/secrets.conf`, then `eval "$(bash fetch-secrets.sh)"`; the policy names the dynamic group, so adding the new OCID to the group's rule is enough), and the restore re-creates the database roles from `stack.env` (section 9).
5. Keep a way back: the old box stays as it is until the soak period ends (step 14).

**The window (users cannot write between steps 1 and 9)**

1. **Old box: stop the writers.** `docker stop sc-server sc-chat sportconnect-dev-keycloak-1`. The site now answers errors on the API and the sign-in.
2. **Old box: the final backup.** `sudo systemctl start sportconnect-backup`, then `journalctl -u sportconnect-backup -n 30 --no-pager`. Note the set stamp `S` (for example `20261102T143000Z`) and check that four objects are under it (three dumps and `caddy_data`).
3. **Old box: switch its own timer off at once**, `sudo systemctl disable --now sportconnect-backup.timer`, or its 02:00 backup (of stopped, unchanging databases) would later become the "newest set" and a restore would pick it. Section 8 item 5 is the same rule for a rehearsal box.
4. **New box: restore the set.** `EXPECT_SET=S bash ~/sportconnect/infra/oracle/scripts/restore-from-bucket.sh`. It refuses if the newest set is not `S`, stops server, chat and Keycloak, replaces the three databases, starts Keycloak and the others, and removes the downloaded dumps. (`RESTORE_CADDY=1` also restores the certificates; the new box already has its own, so leave it off unless it has none.)
5. **New box: the post-restore Keycloak scripts** (section 9 step 4; the restore brings the old box's admin password and settings; the secret files on the new box are copies of the old ones, so these should confirm, not change): `set-credentials-client-secret.sh` (must print "read-back matches the new secret"), `set-master-frontend-url.sh`; check the admin console login with `~/.kc-admin-pw` through the tunnel, the web client's redirect URI, the Google provider and the SMTP settings are still the production values. `set-admin-pw.sh` is only needed if the admin login fails.
6. **New box: check before anyone sees it.** `sportconnect-deploy --plan` (all unchanged), `/actuator/health` from the Compose network, the 12 requests with `curl --resolve` against the new IP, and a sign-in of the owner's account in a browser (a temporary hosts-file line for the test only; remove it afterwards).
7. **iNET: switch DNS.** A `yoursport.vn` and A `auth.yoursport.vn` to the new box's public IP; `www` stays a CNAME to `yoursport.vn`. Check `nslookup yoursport.vn 8.8.8.8` and `nslookup yoursport.vn ns1.inet.vn`.
8. **Wait for the TTL**, then check from outside **without** `--resolve` (section 10, the 12 requests and `verify-internal-isolation.sh`) and look at the new box's access: requests must arrive on it. Until a resolver has the new record it still reaches the old box, which answers errors on the API (its Caddy is still up); that is the visible cost of this plan.
9. **The window ends** when the owner has signed in with a password and with Google, sent a chat message (live push), and received a password-reset email. Then the old box needs no more action; leave it stopped as in steps 1 and 3.

**After the switch**

10. **New box: the backup.** `bash ~/sportconnect/infra/oracle/scripts/install-backup.sh` (set `BACKUP_BUCKET=sportconnect-backups` in `/etc/sportconnect/backup.env`), `sudo systemctl start sportconnect-backup`, four objects under a new stamp, `restore-test.sh`. Only now does the new box write backups.
11. **Mail:** both boxes shared one Brevo key. This is the moment to rotate it (create a new key, `set-smtp.sh` for Keycloak, the new key in `~/web/server.env` and `~/.brevo-smtp-key` on the new box, restart the server, revoke the old key); the owner decided to rotate at the end, not before.
12. **DNS TTL** back to its normal value.
13. **Watch** the first 24 hours: `docker ps`, `deploy.log`, the 02:00 backup of the new box appears in the bucket, `docker stats`.
14. **Soak, then retire the old box (owner's choice of length).** Stop the instance in the console first (compute stops billing on a paid shape; the boot volume still does), later terminate it with the boot volume (section 14), take its OCID out of the dynamic group, and update `INFRA-3_ORACLE_RESOURCES.md`, the rebuild logs and this guide.

**Rolling back**

- **Before step 7 (DNS not switched):** nothing was written on the new box that users could see. On the old box `docker start sportconnect-dev-keycloak-1`, wait for the realm, then `docker start sc-server sc-chat`, and re-enable its timer (`sudo systemctl enable --now sportconnect-backup.timer`).
- **After step 7:** the new box has real writes. Stop its writers, take a backup on it (`sudo systemctl start sportconnect-backup`, note the stamp), run `EXPECT_SET=<that stamp> bash restore-from-bucket.sh` on the old box, start its containers, switch DNS back, and re-enable the old timer while disabling the new one. Do this only inside the soak period.

**Not measured yet:** the length of the window (the rehearsal restore took a few minutes with Keycloak's 36-second start; the final backup and the DNS wait are not timed), whether users reach the new box within the TTL, and the rollback after the switch.

## 18. Credentials, secrets and the production realm (INFRA-14)

What INFRA-14 adds, all in the repo: `infra/oracle/stack.env.example` (the passwords of the backing services, read by Compose); `scripts/rotate-credentials.sh` (`postgres`: the roles `sc_app`, `sc_chat`, `sc_keycloak`, each owning its own database, the extensions created once by an admin, `CONNECT` revoked from PUBLIC; `rabbitmq`: the application user, `guest` removed; `check`: each role connects to its own database over the Docker network and is refused on the others); `scripts/fetch-secrets.sh` (a store to tmpfs files, plus the GHCR login); `scripts/apply-realm-production.sh` (section 6); `infra/oracle/SECRETS.md` (the inventory); `sportconnect-deploy --recreate=server,chat` and `ENV_DIR`; chat 0.2.2 (`REDIS_PASSWORD`). The production override takes every password from `stack.env` and the dev Compose file is untouched.

**What was run.** On a throwaway Postgres and RabbitMQ (removed afterwards): `rotate-credentials.sh postgres` moved a database with a table, a view, a sequence, a function, an enum and PostGIS columns to `sc_app` (the PostGIS tables stay with `postgres`, they belong to the extension); the role could run `ALTER TABLE`, create an index, create a PostGIS table and insert a point without being a superuser; `check` passed (each role refused on the other databases, `guest` gone); a second run changed nothing. `apply-realm-production.sh` on a throwaway Keycloak (section 6). `fetch-secrets.sh` in a Linux container with a stand-in `sops` (files mode 600 in a mode 700 tmpfs folder; a missing item and a non-tmpfs folder both refuse). `docker compose config` with the override renders the new settings and stops when a password is missing. The chat change has a unit test. **Everything below is not run yet** (marked), including the real OCI Vault, SOPS, the roles on the real data, and the `--recreate` option of `sportconnect-deploy`.

### Steps on the box (in this order; each is "(not run yet)" until its result is in the INFRA-14 ticket)

1. **Choose the store (not run yet).** OCI console, Identity & Security, Vault: create a **default** vault (never a virtual private vault, which is billed) with a **software-protected** AES key, then one secret. The form shows no price, so the check is Billing, Cost Analysis the next day: a Vault line of 0.00. The web sources say software-protected keys and secrets are free in Always Free (about 150 secrets) but they disagree on details, so the console is the check. If anything is billed, use SOPS+age instead.
   - *Vault:* the secrets are named `sportconnect-prod-server-env`, `-chat-env`, `-stack-env`, `-kc-admin-pw` and optionally `-ghcr-token` (content: the file, base64 in the console field). Add a policy line to the dynamic group's policy: `Allow dynamic-group sportconnect-box to read secret-bundles in compartment <compartment>`. Put `VAULT_OCID=<the vault's OCID>` in `/etc/sportconnect/secrets.conf` (not secret).
   - *SOPS:* install `sops` and `age` (arm64 builds), `age-keygen -o ~/.config/sops/age/keys.txt` (mode 600; keep a copy of the key in the password manager, it is the only way back in), then `sops -e --input-type binary --output-type json --age <public key> stack.env > ~/secrets/stack-env.sops` for each item; set `SECRETS_BACKEND=sops` in `secrets.conf`.
2. **Make the values (not run yet).** On the box, with `umask 077`: `stack.env` from the example and the new variables in `server.env` and `chat.env` (the examples show which values must match across files; `SECRETS.md` lists them). Generate with `openssl rand -hex 24`; do not type them into chat. Keep the **old** `server.env` and `chat.env` as `*.old` until step 6 passes. Store the files in the chosen store (step 1) and run `eval "$(bash fetch-secrets.sh)"` to prove the round trip; every later script then finds the files through `ENV_DIR`. Without a store, keep the files in `~/web` (mode 600) and skip `fetch-secrets.sh`.
3. **Rehearse on a copy of the real data (not run yet).** Start a throwaway Postgres on its own network (`docker network create sc-rehearsal`; `docker run -d --name sc-rehearsal-pg --network sc-rehearsal --network-alias postgres -e POSTGRES_PASSWORD=<throwaway> ghcr.io/mr-mittt/sportconnect-postgis:16-3.6`), create the three databases, load the newest dumps (`pg_restore -U postgres -d <db> --no-owner --exit-on-error`, the same commands as `restore-from-bucket.sh`), then run `PG_CONTAINER=sc-rehearsal-pg NET=sc-rehearsal rotate-credentials.sh postgres` and `check` with the real `stack.env`. Run `rotate-credentials.sh owners` (read-only counts of the objects each role owns) before the first run, after it, and after a second run: the second must show no difference. Also run a few migration-like statements as `sc_app`, `sc_chat` and `sc_keycloak` on their own databases (`ALTER TABLE users ADD COLUMN x int` then drop it, and the same on `sync_state` and `realm`). Remove the container and the network. This proves the move on real objects without touching production.
4. **Release and deploy chat 0.2.2 first (not run yet).** `/release chat patch`, merge, promote, `sportconnect-deploy`. Chat 0.2.2 reads `REDIS_PASSWORD`; an older chat ignores it and would fail with NOAUTH the moment Redis gets a password.
5. **Rotate the live box (not run yet).** (a) Fresh backup: `sudo systemctl start sportconnect-backup.service`, check it in the bucket (section 8). (b) Install the updated scripts (copy the repo files; `sudo install -m 0755 sportconnect-deploy.sh /usr/local/bin/sportconnect-deploy`). (c) `rotate-credentials.sh postgres` then `rotate-credentials.sh rabbitmq`. (d) At once `start-stack.sh` (recreates Postgres, Redis, RabbitMQ and Keycloak with the new settings; the data volumes are kept) and `sportconnect-deploy --recreate=server,chat --yes` (the containers read their env file again; the deploy waits for health and restores the previous container on failure). A few minutes of downtime; do it when nobody depends on the site. (e) `rotate-credentials.sh check`, then `apply-realm-production.sh apply` and the Keycloak admin password through `set-admin-pw.sh` (the old one is in an old transcript).
   - *If it goes wrong:* the previous containers are restored with the **old** passwords, which no longer fit. Put the superuser back with `docker exec -i sportconnect-dev-postgres-1 psql -U postgres -c "ALTER ROLE postgres PASSWORD '<old>'"` (the local socket needs no password) and start with the `*.old` files; the objects now belong to the new roles, which the superuser can still use.
6. **Check (not run yet).** The checks of section 10 (a password sign-in and a Google sign-in, a live chat message, a password-reset email), `docker ps`, no secret in `docker ps` or `docker logs`, `rotate-credentials.sh check` and `apply-realm-production.sh check` clean. The next scheduled backup runs (it uses the superuser through the local socket, so the rotation does not touch it), then a restore drill: `restore-test.sh` and, on a throwaway box or a rehearsal as in step 3, the whole restore with step 8 below.
7. **Measure Keycloak in production mode (not run yet).** `docker stats --no-stream sportconnect-dev-keycloak-1` at rest and during `k6 run -e TARGET_HOST=auth.yoursport.vn -e TARGET_PATH=/realms/sportconnect/.well-known/openid-configuration infra/scripts/loadtest/t.js` (read-only and anonymous; the numbers are a ceiling and not the cost of a login). Record both in the INFRA-14 ticket.
8. **After every restore or rebuild:** the dumps are restored without owners, so the objects belong to `postgres` again and the roles may not exist. `restore-from-bucket.sh` runs `rotate-credentials.sh postgres` for you when `stack.env` is found (before the services start); run it by hand otherwise.
9. **Retire the plain files (not run yet).** Only after step 6 has passed and a scheduled backup has run: `shred -u ~/web/server.env ~/web/chat.env ~/web/server.env.old ~/web/chat.env.old` (the Vault holds the new values; the old ones are the rollback of step 5 and are useless after it). From then on `sportconnect-deploy` and the scripts need `ENV_DIR`, so fetch first. `~/.kc-admin-pw` stays: `set-admin-pw.sh` reads and writes it, so after changing the admin password, update the Vault secret `sportconnect-prod-kc-admin-pw` too. The other dot-files of section 4 (`~/.internal-secret`, `~/.cred-secret`, `~/.brevo-smtp-*`) are copies of values that also sit in `server.env`; whether to remove them is not decided here.

### Creating the secrets store from nothing, and rebuilding it (INFRA-14)

Written 2026-11-03 from what was done on the A1 box. Parts A to C ran for real (the outputs are in the INFRA-14 ticket and the change history); the table in part D is **not run yet**.

**A. Once, in the OCI console (OCI Vault, the chosen store)**
1. The dynamic group `sportconnect-box` exists and its rule matches the box (section 1 step 6; the backup policy already depends on it).
2. Identity & Security, Vault, **Create Vault**: a **default** vault. Never a *virtual private vault* (billed). Note its OCID (not a secret).
3. In the vault, **Master Encryption Keys**, Create Key: protection mode **Software** (HSM is billed), algorithm **AES**, 256 bits, name `sportconnect-secrets-key`. Wait for *Enabled*. Every secret asks for a key.
4. Identity & Security, Policies, Create Policy in the root compartment, name `sportconnect-box-secrets`, manual editor, one statement: `Allow dynamic-group sportconnect-box to read secret-bundles in tenancy` (use `in compartment <name>` if the vault is not in the root). It is read-only: the box cannot create or change a secret. There is nothing to attach; the policy applies within about a minute.
5. On the box: `oci --version` works (`install-backup.sh` installs it), and `/etc/sportconnect/secrets.conf` holds the line `VAULT_OCID=<the vault OCID>` (`sudo tee`; not secret).
6. The form shows no price. The check is Billing, Cost Analysis the next day: a Vault line of 0.00. If anything is billed, switch to SOPS (step 1 above).

**B. Make the values and upload them**
1. On the box, in RAM (a folder on disk would keep plain-text copies; `/dev/shm` is tmpfs):
   ```
   umask 077; mkdir -p /dev/shm/stage && cd /dev/shm/stage
   for f in server.env chat.env; do tr -d '\r' < ~/web/$f > $f; done     # a fresh box: start from the *.env.example files instead
   gen() { openssl rand -hex 24; }
   setkv() { { grep -v "^$2=" "$1" || true; printf '%s=%s\n' "$2" "$3"; } > "$1.tmp" && mv "$1.tmp" "$1"; }
   P_PG=$(gen); P_APP=$(gen); P_CHAT=$(gen); P_KC=$(gen); P_MQ=$(gen); P_RD=$(gen)
   cat > stack.env <<EOT
   POSTGRES_PASSWORD=$P_PG
   SC_APP_DB_PASSWORD=$P_APP
   SC_CHAT_DB_PASSWORD=$P_CHAT
   KC_DB_PASSWORD=$P_KC
   RABBITMQ_USERNAME=sc_mq
   RABBITMQ_PASSWORD=$P_MQ
   REDIS_PASSWORD=$P_RD
   EOT
   setkv server.env DB_USERNAME sc_app;  setkv server.env DB_PASSWORD "$P_APP"; setkv server.env REDIS_PASSWORD "$P_RD"
   setkv server.env RABBITMQ_USERNAME sc_mq; setkv server.env RABBITMQ_PASSWORD "$P_MQ"
   setkv chat.env CHAT_DATABASE_URL "postgres://sc_chat:$P_CHAT@postgres:5432/sportconnect_chat_dev?sslmode=disable"
   setkv chat.env REDIS_PASSWORD "$P_RD"
   cp ~/.kc-admin-pw kc-admin-pw; unset P_PG P_APP P_CHAT P_KC P_MQ P_RD; chmod 600 *
   for f in *.env; do echo "$f: $(cut -d= -f1 $f | tr '\n' ' ')"; done      # key names only
   ```
   Nothing is applied by this: the live files in `~/web` are not touched, and no service sees the values until section 18 step 5.2. **Save the files in the password manager first** (attachments or secure notes). From your computer, `scp -p sc-a1:/dev/shm/stage/* <a folder outside the repo>`, import them, then delete that local copy. The Vault copy and this one are the only two.
3. In the console, vault, Secrets, **Create Secret**, one per file, the key `sportconnect-secrets-key`, template **Base64**: `sportconnect-prod-server-env`, `-chat-env`, `-stack-env`, `-kc-admin-pw` (and `-ghcr-token` if `fetch-secrets.sh` should log in to GHCR). The content of each is `base64 -w0 <file>`; to move it without showing it, run on your computer `ssh sc-a1 'base64 -w0 /dev/shm/stage/server.env' | clip` and paste. Clear the clipboard (and its history, Win+V) afterwards. Never paste a value into a chat.

**C. Prove the round trip, then remove the staging folder**
```
eval "$(bash ~/sportconnect/infra/oracle/scripts/fetch-secrets.sh)"
for f in server.env chat.env stack.env kc-admin-pw; do cmp /dev/shm/stage/$f $ENV_DIR/$f && echo "$f identical"; done
find /dev/shm/stage -type f -exec shred -u {} + && rmdir /dev/shm/stage       # only after four "identical" lines
```
Four `written` lines and four `identical` lines mean the policy, the key, the encoding and the script are right. Mistakes met on the first run:
- `PIPESTATUS[1]: unbound variable`: a bug in `fetch-secrets.sh` (fixed; the script on the box must be the fixed copy, commit `ad54888` or later).
- `cmp: /server.env: No such file`: `$ENV_DIR` was empty because the fetch had stopped; run the script without `eval` to read its message.
- `cmp` says the files differ: the template and the pasted text did not match (the Base64 template needs base64 text; Plain-Text needs the raw file). Recreate that secret.
- `NotAuthorizedOrNotFound` or `could not be read`: the policy, the group name, the vault OCID or the secret name (`sportconnect-prod-` plus the item).

**D. If a secret or the whole store is lost (not run yet)**

| What is lost | What to do |
|---|---|
| The Vault (deleted, wrong region); the password manager still has the files | Repeat A, then upload the saved files (B step 3) and run C. Nothing on the box changes. |
| The Vault and the password manager; the box still runs | The apps' values are in the running containers' own settings (`docker inspect sc-server` and `sc-chat`; an accepted residue, see below). Read them there without pasting them anywhere, rebuild `server.env` and `chat.env` from them, and save them at once. The service passwords cannot be read back from Postgres, so those are replaced (rows below). |
| Postgres superuser or the role passwords | New values in `stack.env` and the app copies; `rotate-credentials.sh postgres` sets them through the container's local socket (no old password needed); then step 5 (d) so the services read them. |
| RabbitMQ user | New values in `stack.env` and `server.env`; `rotate-credentials.sh rabbitmq`; recreate the server. |
| Redis password | New value in `stack.env`, `server.env` and `chat.env`; `start-stack.sh` (recreates Redis); recreate the server and chat. |
| Keycloak admin password | `set-admin-pw.sh` needs the old one. If both are gone, Keycloak 26's bootstrap-admin options create a new admin on start; not tried here, read Keycloak's documentation at the time. The realm and its users are in `keycloak_dev` and survive. |
| Credentials client secret | New value in `server.env`; `apply-realm-production.sh apply`; recreate the server. |
| Internal service secret | New value in `server.env` and `chat.env` (identical); recreate both. |
| Brevo SMTP key | A new key in Brevo (it cannot be read back); `server.env`; `apply-realm-production.sh apply`; recreate the server. |
| Google OAuth client secret | A new secret in Google Cloud; `infra/scripts/apply-realm-google-provider.sh`. |
| GHCR token | A new classic PAT with only `read:packages`; `docker login ghcr.io` (typed by you, not pasted anywhere). |
| The box's SSH key | A new key pair in the console, then the box's `authorized_keys` through the console. |

After any replacement: put the new value in the Vault (edit the secret, which makes a new version), run `fetch-secrets.sh` again, and update the password-manager copy. `infra/oracle/SECRETS.md` has the same rotations per secret.

**Redis and RabbitMQ residue.** Redis keeps its password in the container's environment (`docker inspect` shows it to anyone in the docker group); `rabbitmqctl` shows the password in its argument list inside the container for the moment it runs; Postgres can write a failed `CREATE ROLE ... PASSWORD` statement to its server log. On a one-user box these are accepted; they are recorded here so they are known.

## Change history

| Date | Ticket | Change |
|---|---|---|
| 2026-10-28 | INFRA-3 | Guide created from the INFRA-12 runbook and the INFRA-3 rebuild (two runs, restore, backups, Brevo, admin password script). |
| 2026-10-28 | INFRA-4 | Added section 15: the server image, the version scheme and how to cut a release (a bump PR; merging it releases; the `/release` command does the bump, commit and push). The box does not pull it yet (INFRA-6); the GHCR push, release dispatch and retention are not run yet. |
| 2026-10-28 | INFRA-5 | Added the client image to section 15: `client/Dockerfile`, the client's own version in `client/package.json` and how to release it (`/release client`). The box does not pull it yet (INFRA-6); the GHCR push, release and retention are not run yet (INFRA-15). |
| 2026-10-29 | INFRA-8 | Added the chat image to section 15: `services/chat/Dockerfile` fixed (Go version from `go.mod`, distroless `nonroot`), the chat version in `services/chat/VERSION` and how to release it (`/release chat`). The box does not pull it yet (INFRA-6); the GHCR push, release and retention are not run yet (INFRA-15). |
| 2026-10-29 | INFRA-6 | Added section 16: promote (GitHub workflow with the `production` Environment approval) and deploy (`sportconnect-deploy` on the box: plan, pull, server then chat then client, health probes, restore-everything on failure, log). Sections 3 and 5 no longer build or copy artifacts; `run-containers.sh` became `start-stack.sh` (dependencies and Caddy only) and `server.Dockerfile` was deleted. The Environment, the first promote, the GHCR login and the first deploy over the sandbox containers are not run yet (INFRA-15). |
| 2026-10-29 | INFRA-6 (fix) | `infra/scripts/promote-apply.sh` copies the manifest through the registry API instead of `docker buildx imagetools create`: the first real promote (server `0.1.0`) failed its digest check because `create` wrapped the image in a new manifest list (`:prod` became `777a3f...`, not `e2d088...`). Tested against a throwaway registry (single-platform image, manifest list, missing digest); the GHCR token step and the rerun of the promote are not run yet. |
| 2026-10-30 | CHAT-22 | Chat's schema is applied by the chat service at start-up (migrations embedded in the binary). Replaced the "seed `schema_migrations` once" step in section 16: the first start on the existing box rebuilds the chat database through `000001`'s drops (data lost, accepted), with a check afterwards. Verified locally on a throwaway database with the real image; the first start on the box is not run yet. |
| 2026-10-30 | INFRA-6 (box) | First run on the box: `sportconnect-deploy` installed (checksum matched), GHCR login, `--plan`, the first deploy over the sandbox containers (53 s, no restore), hardened flags confirmed on the real server and chat images, the up-to-date run, the site checks of section 10 and a chat message. Added the token-expiry note to the login step. Still not run: the deliberate-failure restore on the box. |
| 2026-10-30 | INFRA-6 (checks) | Section 16: added "After a deploy: the checks" (registry read, plan, containers, hardened flags, chat schema, logs, deploy log, up to date, outside checks), how to update only the deploy command, and an SSH alias tip in the first-contact step. |
| 2026-10-30 | INFRA-7 | Section 10: added "Proxy and WebSockets" (the two sockets through Caddy, the no-access-log rule for the `?token=` chat socket, and the checks). `infra/oracle/Caddyfile` is now documented as the production proxy config (comments only, no directive changed, nothing reloaded on the box). |
| 2026-11-01 | INFRA-9 | Section 10: the Caddyfile now refuses `/internal/*` with a 404 (first rule), the table row for `/internal/x` changed from the client page to 404, and new "Changing the Caddyfile and the isolation check" (scp, validate, in-place write, reload, hash, rollback, cleanup) with `infra/scripts/verify-internal-isolation.sh`. First run on the box: the box steps on the owner's word (output not pasted); the isolation check passed 25 of 25 from a computer. |
| 2026-11-01 | INFRA-10 | Section 10: new "Swagger and the API catalogue". The `prod` profile no longer serves the Swagger UI or `/api-docs` (they were already unreachable from the internet, no Caddy rule matches); the server answers 401 for them like any unknown path. Tested with scoped integration tests and mutation checks; the box check (`docker exec sc-caddy wget` against `sc-server:8080`) is not run yet, it needs a server release, a promote and a deploy. |
| 2026-11-01 | INFRA-10 (box) | Server `0.1.1` carries the change. The box check ran after the deploy: `/api-docs` and `/swagger-ui.html` answer `401` from inside the Compose network. Corrected the command (`grep -E 'HTTP/\|error'`, not `head -1`). The "before" reading was not observed; the deploy output was not pasted. |
| 2026-11-02 | INFRA-11 | Section 7 and the `server.env` bullet: the mail health check is switched off in the `prod` profile (`management.health.mail.enabled: false`), so the `MANAGEMENT_HEALTH_MAIL_ENABLED=false` workaround is no longer needed or documented; delivery is checked by sending (welcome and reset emails, owner's word 2026-11-02). Takes effect on the box with the next server release (not run yet). |
| 2026-11-02 | INFRA-12 | Section 15: an ordinary merge to `master` no longer builds or pushes an image; a release builds `linux/amd64` and `linux/arm64` into one multi-arch tag; a pull request builds amd64 only; a manual run takes a `platforms` choice; how to rebuild a release is written down. The plan scripts print `build=true\|false`. Plan scripts tried locally (pull request, ordinary merge, release by push and by dispatch, a branch refused); the workflows are not run on GitHub yet and the A1 box is not built yet. |
| 2026-11-02 | INFRA-12 | Section 5 item 4: the Postgres image is now `sportconnect-postgis:16-3.6` (`infra/postgis/Dockerfile`, `postgis-image.yml`) in the production override, and dev moves to `postgis/postgis:16-3.6`, because the official image has no arm64 build. Built and run on the A1 box (PostGIS 3.6.4, arm64); the workflow is not run on GitHub yet; the restore of real data into it is not run yet. |
| 2026-11-02 | INFRA-12 | Section 3 item 3: the bundle needs its CRLF stripped when it comes from Windows. Section 8 item 5: a rehearsal box does not install the backup timer. Section 9 ran for real onto the A1 box (databases and `caddy_data` from the bucket, PostGIS 3.4.3 data into 3.6.4, counts equal to the x86 box); the post-restore Keycloak scripts of step 4 were not re-run there. |
| 2026-11-02 | INFRA-12 | Section 1 steps 5 to 7: the A1 shape and its 2 OCPU / 12 GB allowance, the dynamic-group rule with two instances while boxes coexist, `uname -m` for both architectures. |
| 2026-11-02 | INFRA-12 | Section 5 item 4: `postgis-image` ran on GitHub (PR #395 merged); `sportconnect-postgis:16-3.6` is a two-platform index in GHCR and the A1 box runs it (data intact). |
| 2026-11-02 | INFRA-12 | Section 15: the first multi-arch releases (server `0.1.2`, client `0.1.1`, chat `0.2.1`, PR #396) built and pushed both platforms; times recorded. Deploying them to the boxes is not run yet. |
| 2026-11-02 | INFRA-15 | GitHub and box checks recorded as proven (ticket `INFRA-15_VERIFY_SERVER_IMAGE_WORKFLOW_ON_GITHUB.md`): section 15 (pull-request runs, version and path filters, master-only refusal, the rebuild-a-release procedure run on chat with one and then both platforms), the PostGIS workflow (pull-request run, tag follows the `ARG`, package private and linked), section 16 (the promote refusals, the failure path with restore on the A1 box). Only the retention deletion is not proven (needs more than 10 `sha-` builds). |
| 2026-11-02 | INFRA-12 | First `sportconnect-deploy` on arm64 (A1 box): server `0.1.2`, chat `0.2.1`, client `0.1.1` in 1 m 07 s, all healthy; Caddy started with the restored certificates; section 10 gets the `curl --resolve` way to check a box before DNS moves (12 of 12 requests identical to the live site). |
| 2026-11-02 | INFRA-12 | The same release deployed on the live x86 box by the owner (45 s, amd64, healthy); the outside checks and the isolation check passed afterwards. Both boxes run server `0.1.2`, chat `0.2.1`, client `0.1.1`. |
| 2026-11-02 | INFRA-12 | New section 17, the cutover from one box to another (preparation, the window, after the switch, rolling back), and the new script `infra/oracle/scripts/restore-from-bucket.sh` (the row 13 restore as a file, with `EXPECT_SET`). **Not run yet**; the final-backup and DNS steps are written, not timed. |
| 2026-11-02 | INFRA-12 | Section 17 renamed "the standard box switch" and given two variants: full (freeze, final backup, restore) and quick (no end users yet: skip steps 1 to 4 and accept the data of the last nightly backup; the old timer is still disabled at the switch). |
| 2026-11-02 | INFRA-12 | **Production moved to the A1 box** (quick variant, section 17): DNS at iNET to `161.33.72.52` (TTL 300 s), 12 of 12 requests and the isolation check pass through real DNS, the backup timer runs on A1 only (first backup `20261102T092631Z`, `restore-test.sh` ok). The x86 box is still running, with no traffic and its timer disabled, until the soak ends. The Brevo key is not rotated yet. |
| 2026-11-02 | INFRA-12 | INFRA-12 closed. The x86 instance is stopped (not yet terminated) and out of the dynamic group; the A1 box reads the bucket with only its own OCID. Section 14 (tearing a box down) applies to the x86 instance when the owner terminates it. |
| 2026-11-03 | INFRA-14 | New section 18 (credentials, secrets, the production realm) and section 13 rewritten: what is still not production-grade (registration open by decision, Brevo key not rotated, Facebook and Zalo, no monitoring). New files `stack.env.example`, `SECRETS.md`, `scripts/rotate-credentials.sh`, `scripts/fetch-secrets.sh`, `scripts/apply-realm-production.sh`; `kc-prod.override.yml` takes every password from `stack.env`; `start-stack.sh` needs `stack.env`; `sportconnect-deploy` gets `--recreate=` and `ENV_DIR`; `restore-from-bucket.sh` re-applies the roles; chat 0.2.2 reads `REDIS_PASSWORD`. Run against throwaway Postgres, RabbitMQ and Keycloak only. **Not run on the box yet** (every step of section 18). |
| 2026-11-03 | INFRA-14 (box) | Vault chosen: default vault, software AES key, policy `Allow dynamic-group sportconnect-box to read secret-bundles in tenancy` (separate policy `sportconnect-box-secrets`), four secrets `sportconnect-prod-*` (Base64 template); `fetch-secrets.sh` round trip byte-identical (owner pasted the output). Its first real run found a bug (`PIPESTATUS` under `set -u`), fixed. Rehearsal on the newest backup in a throwaway Postgres: roles moved, second run changed nothing, isolation check ok, `ALTER TABLE` as each role ok (owner pasted the outputs). New `rotate-credentials.sh owners`. Vault cost line (Cost Analysis) and everything from step 4 on: not run yet. |
| 2026-11-03 | INFRA-14 | Section 18: new subsection "Creating the secrets store from nothing, and rebuilding it": the console set-up (vault, software key, policy, `VAULT_OCID`), making the values in RAM, the Base64 upload, the round trip and the mistakes met, and what to do per secret if the store is lost. Parts A to C ran on the A1 box (owner's pasted outputs); the lost-secret table is not run yet. |
| 2026-11-03 | INFRA-14 | Pointers to section 18 added where the day-to-day procedures are: section 1 (Vault, key and secret-bundles policy), section 9 (the restore re-creates the roles), section 16 (`fetch-secrets.sh` and `ENV_DIR` before `sportconnect-deploy`, `--recreate=`), section 17 (preparation); section 18 step 9 retires the plain env files. Not run on the box yet. |
