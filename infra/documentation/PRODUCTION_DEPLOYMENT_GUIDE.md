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
7. First contact: `ssh -i <key> ubuntu@<ip>`, accept the host key, `cat /etc/os-release` must say 24.04 and `uname -m` x86_64.

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
| `/actuator/health`, `/internal/x`, `/swagger-ui.html` on the main host | the client's `index.html` (not exposed) |

Also: a trusted Let's Encrypt certificate on all three names; the login page shows the Google button; sign in with a password and with Google; a password-reset email arrives.

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

The server image is built from `server/Dockerfile` and published to `ghcr.io/mr-mittt/sportconnect-server` by `.github/workflows/server-image.yml`. The box deploys it with `sportconnect-deploy` (section 16, INFRA-6, not run yet). What exists:

- **Version:** one monolith version, `version` in the root `gradle.properties` (`0.0.0` is the placeholder before the first release). Never edit it by hand.
- **Every server-affecting merge to `master`** is an ordinary build: it pushes `:sha-<short>` and `:edge`, with the jar stamped `<version>+<short sha>`.
- **Cut a release:** `/release` in Claude Code does the steps below (branch, bump, commit, push; `/release patch`, `/release server 1.0.0`; no argument = minor for every versioned component) and hands over the PR link. By hand: `git switch -c chore/server-<X.Y.Z> master`, `infra/scripts/server-version.sh bump` (raises the minor version; `patch`, `major` or an explicit `X.Y.Z` also work, and it refuses a repeat, a downgrade or anything not above the latest `server-v*` tag), commit `chore(release): server X.Y.Z`, open the PR, merge it when `server-ci` is green. On the merge the workflow sees that the tag `server-vX.Y.Z` does not exist, pushes `:X.Y.Z` and `:latest` (plus `:edge` and `:sha-<short>`) and creates the tag last. Nothing to click in GitHub. Every release, a patch included, is a bump PR. (Not run yet: first release after INFRA-4 merges, INFRA-15.)
- **A release whose push failed:** no tag was created, so Actions, server-image, "Run workflow" on `master` (no inputs) releases it.
- **Which version is an image or container?** `docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.version" }}' <image-or-container>`, or the first log line (`Starting SportConnectApplication v<version>`). `0.1.0` is the release; `0.1.0+abc1234` is a later master build.
- **Pulling a private image on the box** needs a classic token with only `read:packages`; the login is described in section 16 (not run yet).
- **Retention:** every release and `latest`/`edge` are kept, plus the newest 10 `sha-*` builds; older ones are deleted by the workflow. (Not run yet; whether the workflow's token may delete versions of a user-owned package is unverified.)

### The client image (INFRA-5)

Same scheme as the server, with its own version and package: `client/Dockerfile` -> `ghcr.io/mr-mittt/sportconnect-client`, built by `.github/workflows/client-image.yml`. The box deploys it with `sportconnect-deploy` (section 16).

- **Version:** `version` in `client/package.json` (`0.0.0` is the placeholder). Tags `client-vX.Y.Z`. Never edit it by hand: `/release client` (or `/release`, which bumps the server, the client and chat together) or `infra/scripts/client-version.sh bump [minor|patch|major|X.Y.Z]`.
- **Release:** merge the bump PR (when `client-ci` is green). `client-image` pushes `:X.Y.Z`, `:latest`, `:edge`, `:sha-<short>` and creates the tag last; other client merges push `:sha-<short>` and `:edge`. A failed release is re-run with Actions, client-image, "Run workflow" on `master`. Retention is the server's (every release, `latest`, `edge`, newest 10 `sha-*`).
- **The image holds the files only.** `docker run --rm -v ~/web/dist:/srv ghcr.io/mr-mittt/sportconnect-client@<digest>` replaces the contents of `~/web/dist`; Caddy has that folder mounted on `/srv` read-only and picks the new files up without a restart or a re-mount (`sportconnect-deploy` does this step). The Keycloak URL is baked in (`https://auth.yoursport.vn`), so one image is for one environment; to build one by hand: `docker build -f client/Dockerfile --build-arg VITE_KEYCLOAK_URL=<url> client`.
- (Not run yet: the first push, release, tag and retention on GitHub, INFRA-15; the pull and the file step on the box, INFRA-6.)

### The chat image (INFRA-8)

Same scheme as the server and the client, with its own version and package: `services/chat/Dockerfile` -> `ghcr.io/mr-mittt/sportconnect-chat`, built by `.github/workflows/chat-image.yml`. The box deploys it with `sportconnect-deploy` (section 16).

- **Version:** `services/chat/VERSION` (`0.0.0` is the placeholder). Tags `chat-vX.Y.Z`. Never edit it by hand: `/release chat` (or `/release`, which bumps all three) or `infra/scripts/chat-version.sh bump [minor|patch|major|X.Y.Z]`.
- **Release:** merge the bump PR (when `chat-ci` is green). `chat-image` pushes `:X.Y.Z`, `:latest`, `:edge`, `:sha-<short>` and creates the tag last; other chat merges push `:sha-<short>` and `:edge`. A failed release is re-run with Actions, chat-image, "Run workflow" on `master`. Retention is the server's (every release, `latest`, `edge`, newest 10 `sha-*`).
- **The image:** a static Go binary on `distroless/static-debian12:nonroot` (UID 65532, port 8090, 5 MB), environment as in `infra/oracle/chat.env.example`. It has no shell, so no in-image health check; `GET /healthz` answers 200 and is probed from outside. The first start asks the server to sync, so start the server first.
- **Which version is running?** The `org.opencontainers.image.version` label, or the `version` field of the `chat service listening` log line.
- **The Go version of the build** is read from `go.mod` by the workflow; the Dockerfile's `GO_VERSION` default only serves a plain local `docker build` and should equal the `go` line of `go.mod`.
- (Not run yet: the first push, release, tag and retention on GitHub, INFRA-15; the pull and start on the box, INFRA-6; the chat image applies no migrations until CHAT-22.)

## 16. Promoting and deploying (INFRA-6)

The box runs what the `prod` tag of each image points at. Two steps, both by hand, nothing automatic: **promote** (GitHub: point `prod` at a release) and **deploy** (the box: pull what `prod` points at and restart). Everything below is **not run yet**; the decisions are tested locally (a throwaway registry and stand-in containers) and the GitHub and box parts are the conditionals in INFRA-15.

### Once: GitHub

1. Repository **Settings, Environments, New environment**, name exactly `production`.
2. Tick **Required reviewers**, add yourself, **Save protection rules**. Leave **Prevent self-review** off (you are the only deployer). On a private repository this option needs a paid GitHub plan; if it is missing, say so before relying on the gate.
3. **Deployment branches and tags**: selected branches, add `master`.
4. No wait timer, no environment secrets.

### Promote (GitHub)

1. Release first (section 15): merge the bump PR, check the image workflow's Summary says `release: true`.
2. **Actions, promote, Run workflow** (from `master`): choose the component (`server`, `client` or `chat`) and the version (`X.Y.Z`, or `sha-<hex>` for a test build). `edge`, `latest` and `prod` are refused. **Skip CI check** only if you accept that the CI of that code failed (the summary records it).
3. The first job writes the summary the reviewer reads: the version and commit on `prod` now and the new ones, and the CI result for that code (the newest `master` run of `<component>-ci` on the image's commit or an ancestor; the CI workflows are path-filtered, so the release commit often has no run of its own). A failed CI run, an image that does not exist, or an image **older** than the one on `prod` stops the run here. Going back to an older version is blocked until INFRA-17 (the database schema may not fit an older release).
4. The second job is named `Retag <component> <now> -> <new>` and waits for you: **Review deployments, Approve**. It then retags the image as `prod` (the same image by digest, nothing rebuilt).

To run CI again for a release whose result is missing or expired: Actions, the CI workflow, Run workflow, choose the tag (for example `server-v0.2.0`).

### Once: the box

1. Copy the repo files (section 3, step 3), including `infra/oracle/scripts/sportconnect-deploy.sh`, check with `file` that the scripts have LF line endings (CRLF breaks them on Linux), and install the command: `sudo install -m 0755 ~/sportconnect/infra/oracle/scripts/sportconnect-deploy.sh /usr/local/bin/sportconnect-deploy`. Re-run it after every change to the script; `sportconnect-deploy --version` prints the checksum of the installed copy (compare with `sha256sum` of the repo file).
2. Log in to GHCR as `ubuntu` with a classic token that has **only `read:packages`**, read from stdin so it never lands in a command line or history: `read -rs T; printf '%s' "$T" | docker login ghcr.io -u <github user> --password-stdin; unset T`. The login is kept in `~/.docker/config.json` (mode 600).
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
- **Chat's schema:** until CHAT-22 ships, a new chat image does not create its own schema, so keep using the schema the box already has. After CHAT-22, seed `schema_migrations` once before the first start of the new image, because this box's chat schema was created with `psql`: `docker exec sportconnect-dev-postgres-1 psql -U postgres -d sportconnect_chat_dev -c "create table if not exists schema_migrations (version bigint not null primary key, dirty boolean not null); insert into schema_migrations values (4, false) on conflict do nothing"` (the number is the last applied migration file; check `services/chat/migrations`).

## Change history

| Date | Ticket | Change |
|---|---|---|
| 2026-10-28 | INFRA-3 | Guide created from the INFRA-12 runbook and the INFRA-3 rebuild (two runs, restore, backups, Brevo, admin password script). |
| 2026-10-28 | INFRA-4 | Added section 15: the server image, the version scheme and how to cut a release (a bump PR; merging it releases; the `/release` command does the bump, commit and push). The box does not pull it yet (INFRA-6); the GHCR push, release dispatch and retention are not run yet. |
| 2026-10-28 | INFRA-5 | Added the client image to section 15: `client/Dockerfile`, the client's own version in `client/package.json` and how to release it (`/release client`). The box does not pull it yet (INFRA-6); the GHCR push, release and retention are not run yet (INFRA-15). |
| 2026-10-29 | INFRA-8 | Added the chat image to section 15: `services/chat/Dockerfile` fixed (Go version from `go.mod`, distroless `nonroot`), the chat version in `services/chat/VERSION` and how to release it (`/release chat`). The box does not pull it yet (INFRA-6); the GHCR push, release and retention are not run yet (INFRA-15). |
| 2026-10-29 | INFRA-6 | Added section 16: promote (GitHub workflow with the `production` Environment approval) and deploy (`sportconnect-deploy` on the box: plan, pull, server then chat then client, health probes, restore-everything on failure, log). Sections 3 and 5 no longer build or copy artifacts; `run-containers.sh` became `start-stack.sh` (dependencies and Caddy only) and `server.Dockerfile` was deleted. The Environment, the first promote, the GHCR login and the first deploy over the sandbox containers are not run yet (INFRA-15). |
