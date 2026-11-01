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

**Per box**
5. **Create the instance.** Compute → Instances → Create. Shape `VM.Standard.E3.Flex`, 2 OCPU / 12 GB (Always Free A1 was out of capacity; revisit under INFRA-12). **Pick the image after the shape and read that it says Ubuntu 24.04** (it reset to 20.04 once). Subnet: the public one, **public IPv4 on**. Boot volume 96 to 100 GB. Upload or generate the SSH key and **keep the private key outside the repo**. After creation, note the public IP.
6. **Point the dynamic group at it.** Instance details → copy the OCID. Edit `sportconnect-box` → matching rule `ALL {instance.id = '<instance OCID>'}`. **A rebuilt box has a new OCID, so this step repeats every time.**
7. First contact: `ssh -i <key> ubuntu@<ip>`, accept the host key, `cat /etc/os-release` must say 24.04 and `uname -m` x86_64. Tip: put the address and key in an SSH alias in `~/.ssh/config` on your computer (`Host sc-box`, `HostName <ip>`, `User ubuntu`, `IdentityFile <key>`, `IdentitiesOnly yes`; the file must be named exactly `config`, no `.txt`), then `ssh sc-box`, `scp file sc-box:~/` and `ssh -L … sc-box` all work without the key and address. The file stays on your computer; nothing of it is committed.

## 2. DNS (iNET)

Create: A `yoursport.vn` → `<ip>`, A `auth.yoursport.vn` → `<ip>`, CNAME `www.yoursport.vn` → `yoursport.vn`. Check with `nslookup yoursport.vn 8.8.8.8` and against the authoritative `ns1.inet.vn`.

When rebuilding a live site, build and test the new box **before** switching DNS: Caddy can serve the existing certificates (step 5.6) and you can test with `curl --resolve yoursport.vn:443:<new-ip> https://yoursport.vn/`. Do not use a hosts-file line as the final check: it masks real DNS. Switch DNS last.

## 3. Prepare the box

1. Copy `infra/oracle/scripts/box-prepare.sh` to the box and run `bash box-prepare.sh`. It opens 80 and 443 in iptables (Oracle's Ubuntu image blocks them even when the security list allows them), persists the rules, and installs Docker and Compose. Open a **new SSH session** so the `docker` group applies.
2. (Replaced by INFRA-6: nothing is built on your computer or on the box any more; the images come from GHCR, section 16.)
3. Bundle and copy (no git credentials on the box): `tar` the repo files listed at the top of `infra/oracle/scripts/start-stack.sh` (leave out `.env` files and `client_secret_*.json`; scan the entry list for secrets before sending) and `scp` them. They unpack to `~/sportconnect` and `~/web`. The server, chat and the client files are no longer copied from a computer: `sportconnect-deploy` pulls them from GHCR (section 16; INFRA-6, not run yet).

## 4. Secrets and environment files (on the box only)

All files `chmod 600`, created with `umask 077`, never typed into chat or onto a command line.

- `~/.internal-secret` and `~/.cred-secret`: `openssl rand -hex 24`.
- `~/.kc-admin-pw`: created in section 6.1 by `set-admin-pw.sh`.
- `~/.brevo-smtp-key` and `~/.brevo-smtp-user`: the Brevo SMTP key and login (section 7). Type them with hidden input (`read -rs`).
- `~/web/server.env` and `~/web/chat.env` from `infra/oracle/server.env.example` and `chat.env.example`: replace every `<placeholder>`; the internal secret must be identical in both files; `KEYCLOAK_CREDENTIALS_CLIENT_SECRET` equals `~/.cred-secret`. Until Brevo exists, set `MANAGEMENT_HEALTH_MAIL_ENABLED=false` (otherwise `/actuator/health` is DOWN); remove it once `MAIL_*` is real.

## 5. Start the stack

1. `bash ~/sportconnect/infra/oracle/scripts/start-stack.sh`. It starts Compose with the production override (Keycloak in production mode, every backing service on `127.0.0.1` only) and Caddy. It does **not** start the server, chat or the client files: run `sportconnect-deploy` for them (section 16). Expect Postgres, Redis, RabbitMQ, Keycloak, Mailpit and Caddy up, then the server and chat after the first deploy.
2. If the site already exists elsewhere, **keep its certificates** so Caddy does not have to pass Let's Encrypt validation before DNS moves (and to stay under its rate limit): stream the old box's `caddy_data` volume into the new one (`ssh <old> 'tar czf - …' | ssh <new> 'tar xzf - …'` into the volume) before step 1, or restore it from a backup (section 9). Never delete the `caddy_data` volume.
3. A **brand new** site needs DNS (section 2) pointing at the box first; Caddy then gets its certificates by itself.

## 6. Keycloak

All run on the box, in this order. Each script's header has the exact `docker exec -i` form. Secrets go in as `printf '%s\n' "$(cat ~/.file)" … | docker exec -i …`, which works whether or not the file ends in a newline; the scripts refuse empty input.

1. **Admin password** (before anything is public). From a real terminal: `scp set-admin-pw.sh`, then `ssh -t -i <key> ubuntu@<ip> ./set-admin-pw.sh`; type your own password (12 or more characters) twice. It changes it in Keycloak, verifies by logging in, writes `~/.kc-admin-pw` and prints the stored length (it must equal what you typed). The `!` prefix inside Claude Code has no TTY and cannot run it.
2. `set-web-client-uris.sh`: production redirect URI and web origin for the client `sportconnect-web` (replaces the localhost entries).
3. `set-credentials-client-secret.sh`: puts `~/.cred-secret` on the client `sportconnect-credentials`; it must print "read-back matches the new secret".
4. `set-smtp.sh`: the realm's own mail (reset, verification, account-link) through Brevo, section 7.
5. The realm scripts that matter in production, from your computer **through the SSH tunnel** (`ssh -L 18081:127.0.0.1:8081 -i <key> ubuntu@<ip>`, then `KEYCLOAK_URL=http://localhost:18081`, admin password read from the box): the Google provider (`infra/scripts/apply-realm-google-provider.sh` with the real Google client), phone rules, normalized email, link-existing-account, Google picture and email-verified, edit-username, password policy and credentials client, as listed in `CLAUDE.md`. Only the Google provider was applied on the live realm so far; the others were not rerun on the production realm (INFRA-14 owns this; check each with its `verify-*.mjs` before trusting it).
6. `set-master-frontend-url.sh`: lets the admin console work through the tunnel (`http://localhost:18081/admin/`).

The production redirect URIs, credentials secret, SMTP and master `frontendUrl` are applied through the admin API only and are not mirrored in the realm file (recorded deviation; INFRA-14 and INFRA-11 productize them).

## 7. Email (Brevo)

1. Brevo free plan (about 300 emails a day, SMTP relay included; Oracle blocks port 25, so use 587). In Brevo: SMTP & API → create an **SMTP key**; note the **SMTP login** (not the key). Authenticate the sender domain `yoursport.vn` (SPF, DKIM, DMARC records at iNET) so mail reaches inboxes; the exact Brevo screens were not recorded, follow Brevo's current domain-authentication page.
2. Put the key and login in `~/.brevo-smtp-key` and `~/.brevo-smtp-user` (hidden input). Run `set-smtp.sh` (host `smtp-relay.brevo.com`, port 587, from `noreply@yoursport.vn`, STARTTLS).
3. In `~/web/server.env` set `MAIL_USERNAME` and `MAIL_PASSWORD`, remove the `MANAGEMENT_HEALTH_MAIL_ENABLED=false` workaround, and recreate the server and chat containers. `/actuator/health` UP with the mail check on proves the login to Brevo; a real delivered message still has to be checked by sending one (reset-password from the login page).
4. Rotate the key whenever it has been seen anywhere other than the box. Status: the current key was pasted in chat earlier and is deliberately not rotated yet (INFRA-12).

## 8. Backups

1. `bash ~/sportconnect/infra/oracle/scripts/install-backup.sh`: installs the OCI CLI (pipx), creates `/etc/sportconnect/backup.env` (set `BACKUP_BUCKET=sportconnect-backups`) and enables `sportconnect-backup.timer` (19:00 UTC = 02:00 Vietnam).
2. First run by hand: `sudo systemctl start sportconnect-backup`, then `journalctl -u sportconnect-backup -n 30 --no-pager`. Expect four objects under `<UTC stamp>/`: `sportconnect_dev`, `sportconnect_chat_dev`, `keycloak_dev` dumps and the `caddy_data` archive.
3. Prove the restore: `BACKUP_BUCKET=sportconnect-backups bash ~/sportconnect/infra/oracle/scripts/restore-test.sh`. It restores the newest set into scratch databases, checks a key table in each, and drops them. Repeat after any change to the Postgres image or its extensions.
4. Check the schedule with `systemctl list-timers sportconnect-backup.timer`. The timer's own scheduled run and the 7-day lifecycle deletion have not been observed yet.

## 9. Restoring onto a new box (rebuild with data)

Use when the box is lost or rebuilt and the data must come along. Order matters.

1. Do sections 1 to 6.1 and 6.2 to 6.3 as for a new box (new instance, dynamic group OCID, bundle, secrets, `start-stack.sh`, `sportconnect-deploy`, admin password).
2. Get the newest set from the bucket (`oci os object list/get` with the instance principal, or run `restore-test.sh` to see the commands it uses).
3. Stop `sc-server`, `sc-chat` and Keycloak. For each of the three databases: `DROP DATABASE … WITH (FORCE)`, `CREATE DATABASE`, `pg_restore --no-owner --exit-on-error`. Restore `caddy_data` by `tar xzf` into the volume. Start Keycloak, then server, then chat. Delete the downloaded files (they hold user data).
4. **The Keycloak restore reverts the master admin password and the realm settings that were applied by API only.** Re-run `set-admin-pw.sh` (or reset to your password), `set-credentials-client-secret.sh`, `set-master-frontend-url.sh`; check the web redirect URI, Google provider and SMTP are still production values.
5. Check (section 10), then switch DNS.

This exact sequence ran on 2026-10-27 (sandbox to new box, 2 accounts); a restore from the **bucket** onto a fresh box has been run for the test databases only (scratch restore), not as a full rebuild.

## 10. Check from outside Oracle

From your computer, with real DNS:

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

Check on the box after the deploy that carries this change (not run yet; it needs a server release, a promote and `sportconnect-deploy`): `docker exec sc-caddy wget -S -O /dev/null http://sc-server:8080/api-docs 2>&1 | head -1` and the same for `/swagger-ui.html` must show `401`; on a server from before the change they show `200`. There is no Swagger on the box by design; to look at the API, run the server locally in the dev profile.

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

## 13. Still dev-grade (INFRA-14 must change)

Postgres password `sa` (one superuser shared by the app, chat and Keycloak), RabbitMQ `guest/guest`, Redis without a password (all loopback-only); the committed realm's dev secret for the credentials client is replaced only on the live realm; registration is open and the welcome email depends on Brevo's free quota; no deploy pipeline or registry in use yet (INFRA-4, 6, 8); secrets live in files on the box (OCI Vault planned in INFRA-14); no monitoring or alerting; a single box with no redundancy.

## 14. Tearing a box down

Terminate the instance and tick "permanently delete the boot volume"; remove any reserved public IP; revoke the Brevo key if the whole deployment is ending; delete DNS records only if the domain should stop pointing at Oracle. Update the dynamic group rule if another box takes over.

## 15. The server, client and chat images and releases (INFRA-4, INFRA-5, INFRA-8)

The server image is built from `server/Dockerfile` and published to `ghcr.io/mr-mittt/sportconnect-server` by `.github/workflows/server-image.yml`. The box deploys it with `sportconnect-deploy` (section 16, INFRA-6; first deploy on 2026-10-30). What exists:

- **Version:** one monolith version, `version` in the root `gradle.properties` (`0.0.0` is the placeholder before the first release). Never edit it by hand.
- **Every server-affecting merge to `master`** is an ordinary build: it pushes `:sha-<short>` and `:edge`, with the jar stamped `<version>+<short sha>`.
- **Cut a release:** `/release` in Claude Code does the steps below (branch, bump, commit, push; `/release patch`, `/release server 1.0.0`; no argument = minor for every versioned component) and hands over the PR link. By hand: `git switch -c chore/server-<X.Y.Z> master`, `infra/scripts/server-version.sh bump` (raises the minor version; `patch`, `major` or an explicit `X.Y.Z` also work, and it refuses a repeat, a downgrade or anything not above the latest `server-v*` tag), commit `chore(release): server X.Y.Z`, open the PR, merge it when `server-ci` is green. On the merge the workflow sees that the tag `server-vX.Y.Z` does not exist, pushes `:X.Y.Z` and `:latest` (plus `:edge` and `:sha-<short>`) and creates the tag last. Nothing to click in GitHub. Every release, a patch included, is a bump PR. (Not run yet: first release after INFRA-4 merges, INFRA-15.)
- **A release whose push failed:** no tag was created, so Actions, server-image, "Run workflow" on `master` (no inputs) releases it.
- **Which version is an image or container?** `docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.version" }}' <image-or-container>`, or the first log line (`Starting SportConnectApplication v<version>`). `0.1.0` is the release; `0.1.0+abc1234` is a later master build.
- **Pulling a private image on the box** needs a classic token with only `read:packages`; the login is described in section 16 (done on the box on 2026-10-30).
- **Retention:** every release and `latest`/`edge` are kept, plus the newest 10 `sha-*` builds; older ones are deleted by the workflow. (Not run yet; whether the workflow's token may delete versions of a user-owned package is unverified.)

### The client image (INFRA-5)

Same scheme as the server, with its own version and package: `client/Dockerfile` -> `ghcr.io/mr-mittt/sportconnect-client`, built by `.github/workflows/client-image.yml`. The box deploys it with `sportconnect-deploy` (section 16).

- **Version:** `version` in `client/package.json` (`0.0.0` is the placeholder). Tags `client-vX.Y.Z`. Never edit it by hand: `/release client` (or `/release`, which bumps the server, the client and chat together) or `infra/scripts/client-version.sh bump [minor|patch|major|X.Y.Z]`.
- **Release:** merge the bump PR (when `client-ci` is green). `client-image` pushes `:X.Y.Z`, `:latest`, `:edge`, `:sha-<short>` and creates the tag last; other client merges push `:sha-<short>` and `:edge`. A failed release is re-run with Actions, client-image, "Run workflow" on `master`. Retention is the server's (every release, `latest`, `edge`, newest 10 `sha-*`).
- **The image holds the files only.** `docker run --rm -v ~/web/dist:/srv ghcr.io/mr-mittt/sportconnect-client@<digest>` replaces the contents of `~/web/dist`; Caddy has that folder mounted on `/srv` read-only and picks the new files up without a restart or a re-mount (`sportconnect-deploy` does this step). The Keycloak URL is baked in (`https://auth.yoursport.vn`), so one image is for one environment; to build one by hand: `docker build -f client/Dockerfile --build-arg VITE_KEYCLOAK_URL=<url> client`.
- (Not run yet: the first push, release, tag and retention on GitHub, INFRA-15; the pull and the file step on the box ran on 2026-10-30, INFRA-6.)

### The chat image (INFRA-8)

Same scheme as the server and the client, with its own version and package: `services/chat/Dockerfile` -> `ghcr.io/mr-mittt/sportconnect-chat`, built by `.github/workflows/chat-image.yml`. The box deploys it with `sportconnect-deploy` (section 16).

- **Version:** `services/chat/VERSION` (`0.0.0` is the placeholder). Tags `chat-vX.Y.Z`. Never edit it by hand: `/release chat` (or `/release`, which bumps all three) or `infra/scripts/chat-version.sh bump [minor|patch|major|X.Y.Z]`.
- **Release:** merge the bump PR (when `chat-ci` is green). `chat-image` pushes `:X.Y.Z`, `:latest`, `:edge`, `:sha-<short>` and creates the tag last; other chat merges push `:sha-<short>` and `:edge`. A failed release is re-run with Actions, chat-image, "Run workflow" on `master`. Retention is the server's (every release, `latest`, `edge`, newest 10 `sha-*`).
- **The image:** a static Go binary on `distroless/static-debian12:nonroot` (UID 65532, port 8090, 5 MB), environment as in `infra/oracle/chat.env.example`. It has no shell, so no in-image health check; `GET /healthz` answers 200 and is probed from outside. The first start asks the server to sync, so start the server first.
- **Which version is running?** The `org.opencontainers.image.version` label, or the `version` field of the `chat service listening` log line.
- **The Go version of the build** is read from `go.mod` by the workflow; the Dockerfile's `GO_VERSION` default only serves a plain local `docker build` and should equal the `go` line of `go.mod`.
- (Not run yet: the first push, release, tag and retention on GitHub, INFRA-15; the pull and start on the box ran on 2026-10-30, INFRA-6, including the first start of the chat image that migrates itself, CHAT-22.)

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
3. `~/web/server.env`, `~/web/chat.env` (section 4) and the folder `~/web/dist` exist, and the stack is started (`start-stack.sh`, section 5). The command checks all of this and says what is missing.

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

Not covered by a recorded run yet: the failure path. To test it on a release that has something to deploy, break one value in a copy of the component's env file, run `sportconnect-deploy`, and check that everything the run changed is put back and the report reads right.

**Updating the command later.** To change only the script, no bundle is needed: `scp` the one file to the box, `sudo install -m 0755 ~/sportconnect-deploy.sh /usr/local/bin/sportconnect-deploy`, then `sportconnect-deploy --version` must equal `sha256sum infra/oracle/scripts/sportconnect-deploy.sh` on your computer. Check the repo file has LF line endings first (`file`).

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
