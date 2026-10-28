# INFRA-12 · Oracle sandbox runbook

> **Superseded as the how-to by `infra/documentation/PRODUCTION_DEPLOYMENT_GUIDE.md` (2026-10-28).** Follow that guide to build a box; this file stays as the INFRA-12 record and still holds the backup section and gotchas it was written with.

How to rebuild, on a fresh Oracle Cloud instance, what INFRA-12 set up by hand on 2026-10-26: the whole stack behind HTTPS on `yoursport.vn`, with Keycloak, Google sign-in and real email. The history, with every command, result and failure, is `INFRA-12_ORACLE_INSTANCE_SETUP_LOG.md`; the findings and the go/no-go are in `INFRA-12_SPIKE_ORACLE_ALWAYS_FREE_HOSTING.md`. The files are in `infra/oracle/`.

**Status of this runbook.** It is written from what was done, not from a second run. `box-prepare.sh` and `run-containers.sh` were only syntax-checked. The four `set-*.sh` Keycloak scripts are the cleaned-up forms of commands that ran on the box. Treat the first rebuild as a test and fix this file where it is wrong.

**What it is not.** A sandbox on a credit-funded x86 shape (`VM.Standard.E3.Flex`, 2 OCPU, 12 GB), not the Always Free A1 test (A1 was out of capacity). Not production: see "Still dev-grade" below. Not a replacement for INFRA-3 to INFRA-6, INFRA-14.

## What is in `infra/oracle/`

| File | What it is |
|---|---|
| `Caddyfile` | the three sites: `yoursport.vn` (client + `/api`, `/api/chat`, `/ws`, `/images`), `www` redirect, `auth.yoursport.vn` (Keycloak, admin blocked) |
| `kc-prod.override.yml` | Compose override for `infra/docker-compose.dev.yml`: Keycloak production mode and public hostname; every backing service on `127.0.0.1` only |
| `server.env.example`, `chat.env.example` | the `prod`-profile environment of the server and chat, with `<placeholders>` (the real files are never committed) |
| `server.Dockerfile` | a throwaway server image for measuring (INFRA-4 replaces it) |
| `scripts/box-prepare.sh` | firewall (80, 443, persisted) and Docker on a fresh Ubuntu 24.04 |
| `scripts/run-containers.sh` | builds the two images, starts Compose, applies chat's schema, starts server, chat and Caddy in the right order |
| `scripts/set-admin-pw.sh` | replaces the Keycloak admin default password with one you type (hidden prompt, run with `ssh -t`), stores it in `~/.kc-admin-pw`; strips paste markers and prints the stored length (INFRA-3) |
| `scripts/set-smtp.sh` | realm SMTP (Keycloak's own mail) from env vars + secrets on stdin |
| `scripts/set-credentials-client-secret.sh` | random secret for the realm client `sportconnect-credentials` |
| `scripts/set-web-client-uris.sh` | production redirect URI and web origin for the realm client `sportconnect-web` |
| `scripts/set-master-frontend-url.sh` | lets the Keycloak admin console work through an SSH tunnel |
| `scripts/backup-postgres.sh`, `scripts/restore-test.sh`, `scripts/install-backup.sh`, `systemd/sportconnect-backup.{service,timer}`, `backup.env.example` | nightly backup of the three databases and the Caddy certificates to Object Storage, the restore test, and their installer (INFRA-3; see "Nightly backup" below) |

## Order of work

1. **Oracle console.** Create the VCN with the **VCN wizard "Create VCN with Internet Connectivity"** (VCN `10.0.0.0/16`, public subnet `10.0.0.0/24`). The instance form's "create new VCN" option leaves the public-IP switch locked. Create the instance on a shape the console marks Always Free-eligible, or a paid one from the trial credit; **pick the image after the shape and check it says Ubuntu 24.04** (it reset to 20.04 once). Public IPv4 on, 100 GB boot volume, keep the downloaded SSH private key out of the repo.
2. **Network.** Security list ingress TCP 22, 80, 443 from `0.0.0.0/0`. The public subnet's route table needs `0.0.0.0/0` to the **Internet Gateway** (target type Internet Gateway, not Private IP), otherwise SSH times out.
3. **DNS** (iNET for `yoursport.vn`): A records `@`, `auth` to the instance IP, and `www` as a CNAME of the apex. Check with `nslookup` before asking for certificates.
4. **On the box:** `bash box-prepare.sh`. Then a new SSH session so the `docker` group applies.
5. **Copy the files** (no git credentials on the box): `tar` the repo files listed at the top of `run-containers.sh` (leave out `.env` files and `client_secret_*.json`), `scp` them with `server.jar` (`./gradlew :server:bootJar -x test`) and the client build. Client build: `VITE_KEYCLOAK_URL=https://auth.yoursport.vn pnpm build` in `client/`, then `tar` the `dist/` folder.
6. **Secrets, on the box only** (each `chmod 600`, created with `umask 077`): `~/.kc-admin-pw` (the Keycloak admin password), `~/.internal-secret` and `~/.cred-secret` (`openssl rand -hex 24`), `~/.brevo-smtp-key`. Create them by typing into a terminal on the box with hidden input (`read -rs`), not through chat. Fill `server.env` and `chat.env` from the `.example` files.
7. **Start it:** `bash run-containers.sh`.
8. **Keycloak realm steps**, in this order, each from the box (the `docker exec -i … sh -c "$(cat script)"` forms are in each script's header):
   1. change the admin password from the dev default with `set-admin-pw.sh` (copy it to the box, then `ssh -t -i <key> ubuntu@<ip> ./set-admin-pw.sh` from a real terminal; the `!` prefix in Claude Code has no TTY), before anything is public. It must be this script and not a hand-made file: a pasted password once got stored with 12 invisible paste-marker bytes and the console rejected the real one (INFRA-3 rebuild log). Every script below that reads `~/.kc-admin-pw` is fed with `printf '%s\n' "$(cat ~/.kc-admin-pw)" ... | docker exec -i ...`, which works whether or not the file ends in a newline;
   2. `set-web-client-uris.sh`;
   3. `set-credentials-client-secret.sh`;
   4. `set-smtp.sh`;
   5. the repo's realm scripts that matter in production (Google provider with the real client, phone rules, normalized email, ...): the existing `infra/scripts/apply-realm-*.sh` / `realm-*.mjs`, run **from the dev machine through the SSH tunnel** (`KEYCLOAK_URL=http://localhost:18081`, `KEYCLOAK_ADMIN_PASSWORD` read from the box). Only the Google provider was done on 2026-10-26;
   6. `set-master-frontend-url.sh` (only if you want the admin console, see below).
9. **Check from outside Oracle:** `https://yoursport.vn/api/reference/countries` returns JSON; `https://auth.yoursport.vn/` redirects to the login page; `https://auth.yoursport.vn/admin/` is **403**; `/actuator`, `/internal` and `/swagger-ui.html` return the client's `index.html` (not exposed).

## Nightly backup (INFRA-3)

Nightly at 19:00 UTC (02:00 in Vietnam) a systemd timer dumps `sportconnect_dev`, `sportconnect_chat_dev` and `keycloak_dev` (`pg_dump -Fc`, checked with `pg_restore -l`) and archives the `caddy_data` volume, then uploads the set to a private Object Storage bucket as `<UTC timestamp>/<file>`. **7 nightly sets are kept for 7 days** by a bucket lifecycle rule; the script itself keeps 2 days of files on the box. The dumps hold user data and the archive holds the certificate keys: keep the bucket private. Not encrypted by us beyond Oracle's encryption at rest (INFRA-14).

**Console work (owner, once per tenancy; names are examples):**
1. Object Storage → Create bucket `sportconnect-backups`, Standard tier, **private**, encryption with Oracle-managed keys. Then the bucket's **Lifecycle Policy Rules** → create a rule: action *Delete*, target *Objects*, **7 days**, enabled.
2. Identity & Security → Domains → (default domain) → Dynamic groups → create `sportconnect-box` with the rule `ALL {instance.id = '<instance OCID>'}` (the OCID is on the instance's details page; a rebuild has a new one, so update the rule).
3. Identity & Security → Policies → create a policy in the root compartment: `Allow dynamic-group sportconnect-box to manage objects in tenancy where target.bucket.name = 'sportconnect-backups'` and `Allow dynamic-group sportconnect-box to read buckets in tenancy`. (If the tenancy uses identity domains, the group may need the domain prefix: `Default/sportconnect-box`.)

**On the box** (after `run-containers.sh`): `bash ~/sportconnect/infra/oracle/scripts/install-backup.sh` installs the OCI CLI (pipx), creates `/etc/sportconnect/backup.env` (set `BACKUP_BUCKET`) and enables the timer. First run by hand: `sudo systemctl start sportconnect-backup`, then `journalctl -u sportconnect-backup -n 30 --no-pager`. Check the next run with `systemctl list-timers sportconnect-backup.timer`.

**Prove it restores** (after the first backup and after any change to the Postgres image or its extensions): `BACKUP_BUCKET=<bucket> bash ~/sportconnect/infra/oracle/scripts/restore-test.sh` downloads the newest set, restores each database into a scratch database (`restore_test_<name>`, never the real ones), checks a key table (`users`, `sync_state`, `realm`) and drops the scratch databases. `--local` uses the newest dumps in `~/backups` instead of the bucket. The dump and restore half was run on the INFRA-12 sandbox on 2026-10-27 (all three restored, PostGIS included); the OCI upload, the instance principal and the timer are **not yet run** (see `INFRA-3_ORACLE_REBUILD_LOG.md`).

**Restoring for real** (a lost box or a bad change): stop `sc-server` and `sc-chat`, `docker exec -i sportconnect-dev-postgres-1 pg_restore -U postgres -d <db> --clean --if-exists --no-owner < <db>-<stamp>.dump`, restore `caddy_data` with `tar xzf` into the volume, start the containers. Practise it on a scratch box before relying on it.

## Keycloak admin console (tunnel only)

The public host blocks `/admin` and the master realm. To use the console:
```
ssh -L 18081:127.0.0.1:8081 -i <key> ubuntu@<box-ip>      # leave it open
```
then `http://localhost:18081/admin/master/console/`, user `admin`. Needs `KC_HOSTNAME_ADMIN` (in the override) **and** `set-master-frontend-url.sh`; with only the first, the console loads but asks the blocked public host for `/realms/master/...` and fails with "Something went wrong". The browser login after both was **not confirmed** at the time of writing. Admin scripts must log in through the tunnel (or `kcadm` inside the container), never through the public host, because admin tokens carry the tunnel issuer.

## Gotchas found

- Oracle's Ubuntu image blocks 80 and 443 in iptables even when the security list allows them; Docker-published ports skip those rules, so test a host listener to prove the iptables rules.
- A new certificate name is probed by scanners within seconds. Block the Keycloak admin paths in the same change that publishes it.
- `services/chat/Dockerfile` cannot build (Go 1.22 image, `go.mod` needs 1.25): INFRA-8 Delta. `run-containers.sh` patches the version from `go.mod`.
- The `dev` profile hard-codes `app.internal-service-secret: some-shared-dev-secret` and ignores the `INTERNAL_SERVICE_SECRET` variable; the sandbox runs the `prod` profile instead.
- Under the `prod` profile with no SMTP credentials `/actuator/health` is DOWN (mail health check): INFRA-11 Delta.
- Chat needs `REDIS_ADDR` (default `localhost:6379`), its schema is not created automatically, and it exits if it starts before the server is ready; Docker's restart policy covers the last one, `run-containers.sh` orders the start.
- Keycloak's read-back of `smtpServer` and `kcadm ... --fields attributes` hide values (password, nested attributes); read the whole object to see them.
- `curl` and Git Bash rewrite a leading `/path` into `C:/Program Files/Git/path` in `-w` labels; cosmetic only.
- Do not delete the `caddy_data` volume: Let's Encrypt rate-limits re-issuing.
- Container names matter: Caddy reaches `keycloak`, `sc-server` and `sc-chat` by name on `sportconnect-dev_default`.

## Still dev-grade (INFRA-14 must change)

Postgres password `sa` (one superuser shared by the app, chat and Keycloak), RabbitMQ `guest/guest`, Redis without a password (all loopback-only); the committed realm's dev secret for the credentials client is replaced only on the live realm, not in any script or the realm file; the production realm settings (redirect URIs, SMTP) were applied through the admin API only; registration is open to anyone and the welcome email depends on the Brevo free plan (about 300 a day); no backups of the database, Keycloak or the Caddy certificates; no deploy pipeline (INFRA-4, 6, 8) and no image registry in use (GHCR is planned); secrets live in files on the box.

## Cost and teardown

The instance bills the trial credit while it exists. To stop: terminate the instance and tick "permanently delete the boot volume", delete the reserved/ephemeral public IP if one was added, and revoke the Brevo SMTP key. Delete the DNS records only if the domain should stop pointing at Oracle.
