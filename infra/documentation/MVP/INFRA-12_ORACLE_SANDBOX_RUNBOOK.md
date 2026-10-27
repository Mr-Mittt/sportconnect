# INFRA-12 · Oracle sandbox runbook

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
| `scripts/set-smtp.sh` | realm SMTP (Keycloak's own mail) from env vars + secrets on stdin |
| `scripts/set-credentials-client-secret.sh` | random secret for the realm client `sportconnect-credentials` |
| `scripts/set-web-client-uris.sh` | production redirect URI and web origin for the realm client `sportconnect-web` |
| `scripts/set-master-frontend-url.sh` | lets the Keycloak admin console work through an SSH tunnel |

## Order of work

1. **Oracle console.** Create the VCN with the **VCN wizard "Create VCN with Internet Connectivity"** (VCN `10.0.0.0/16`, public subnet `10.0.0.0/24`). The instance form's "create new VCN" option leaves the public-IP switch locked. Create the instance on a shape the console marks Always Free-eligible, or a paid one from the trial credit; **pick the image after the shape and check it says Ubuntu 24.04** (it reset to 20.04 once). Public IPv4 on, 100 GB boot volume, keep the downloaded SSH private key out of the repo.
2. **Network.** Security list ingress TCP 22, 80, 443 from `0.0.0.0/0`. The public subnet's route table needs `0.0.0.0/0` to the **Internet Gateway** (target type Internet Gateway, not Private IP), otherwise SSH times out.
3. **DNS** (iNET for `yoursport.vn`): A records `@`, `auth` to the instance IP, and `www` as a CNAME of the apex. Check with `nslookup` before asking for certificates.
4. **On the box:** `bash box-prepare.sh`. Then a new SSH session so the `docker` group applies.
5. **Copy the files** (no git credentials on the box): `tar` the repo files listed at the top of `run-containers.sh` (leave out `.env` files and `client_secret_*.json`), `scp` them with `server.jar` (`./gradlew :server:bootJar -x test`) and the client build. Client build: `VITE_KEYCLOAK_URL=https://auth.yoursport.vn pnpm build` in `client/`, then `tar` the `dist/` folder.
6. **Secrets, on the box only** (each `chmod 600`, created with `umask 077`): `~/.kc-admin-pw` (the Keycloak admin password), `~/.internal-secret` and `~/.cred-secret` (`openssl rand -hex 24`), `~/.brevo-smtp-key`. Create them by typing into a terminal on the box with hidden input (`read -rs`), not through chat. Fill `server.env` and `chat.env` from the `.example` files.
7. **Start it:** `bash run-containers.sh`.
8. **Keycloak realm steps**, in this order, each from the box (the `docker exec -i … sh -c "$(cat script)"` forms are in each script's header):
   1. change the admin password from the dev default (`kcadm.sh set-password -r master --username admin --new-password …`, password on stdin), before anything is public;
   2. `set-web-client-uris.sh`;
   3. `set-credentials-client-secret.sh`;
   4. `set-smtp.sh`;
   5. the repo's realm scripts that matter in production (Google provider with the real client, phone rules, normalized email, ...): the existing `infra/scripts/apply-realm-*.sh` / `realm-*.mjs`, run **from the dev machine through the SSH tunnel** (`KEYCLOAK_URL=http://localhost:18081`, `KEYCLOAK_ADMIN_PASSWORD` read from the box). Only the Google provider was done on 2026-10-26;
   6. `set-master-frontend-url.sh` (only if you want the admin console, see below).
9. **Check from outside Oracle:** `https://yoursport.vn/api/reference/countries` returns JSON; `https://auth.yoursport.vn/` redirects to the login page; `https://auth.yoursport.vn/admin/` is **403**; `/actuator`, `/internal` and `/swagger-ui.html` return the client's `index.html` (not exposed).

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
