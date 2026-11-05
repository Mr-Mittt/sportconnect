# INFRA-19 · A "box" config image: ship the box's non-secret files by pull, so a fresh or changed box needs no manual file copying

**Status:** `IN PROGRESS` · **Type:** Infrastructure · **Depends on:** INFRA-6 (done); best done with or after INFRA-14 (it reshapes `start-stack.sh` and the Compose override, which this image would carry)

**Filed:** 2026-11-01, from the owner's question after INFRA-7: apart from the Caddyfile, what else must be copied to a fresh box, and how to make it all automatic. Estimated and costed against the alternatives; the owner has not decided between those yet (see below).

## What

Today the box's non-secret files arrive by hand: a `tar` bundle of `infra/` files (Compose files, init SQL, RabbitMQ config, realm, themes, the two Keycloak JARs built on the owner's computer) plus `Caddyfile` and `kc-prod.override.yml` copied into `~/web` (guide section 3). Changing the Caddyfile is a manual `scp` and a `caddy reload` that has never been run on the box. This ticket makes the box a **fourth deployable component** next to server, chat and client.

- **Build:** a CI workflow (same shape as `client-image`/`chat-image`) builds a data-only image `sportconnect-box` holding every non-secret file, with the Keycloak theme and extension JARs **built in CI** instead of on a computer. Versioned, OCI labels, released on merge like the others.
- **Promote:** `promote.yml` accepts `box` as a component and retags it as `prod` under the same approval gate and checks.
- **Deploy (changed 2026-11-04: a new `sportconnect-setup` does this, see Scope change below):** `sportconnect-setup` pulls it, unpacks it into `~/sportconnect` and `~/web` (the way it already fills `dist` from the client image), runs `caddy validate` then `caddy reload`, and runs `compose up -d` only when a Compose file changed. On failure it restores the previous files, as it does for the other components.

Who: the owner, through the existing promote and deploy flow. A fresh box then needs only `box-prepare.sh`, the GHCR login, the secrets and `sportconnect-deploy`.

## Estimate (not measured; one working session = one focused day including the real run and the docs)

| Option | Estimate | Note |
|---|---|---|
| **Box config image (this ticket)** | **2 to 3 days** | JAR and theme build in CI (JDK, Maven, pnpm) about 0.5 day; `sportconnect-deploy` extension with restore about 1 day; workflow, promote change, docs and a real run on the box the rest. |
| cloud-init wrapper on top | +0.5 day | Only after the image exists. Runs once at first boot, hard to debug, cannot hold secrets until INFRA-14's Vault fetch. |
| Ansible | 2 to 3 days | A second way to deploy next to `sportconnect-deploy`; control machine, inventory, Python on the box. |
| Terraform (OCI) | 3 to 5 days plus upkeep | Needs an OCI API key (conflicts with "no long-lived cloud credentials"), a state backend, an import of the existing box (a wrong import can plan a destroy) and A1 capacity (the INFRA-12 "A1 retry" item). Pays off only if the box is rebuilt often or a second environment is wanted. |

**Open decision:** whether to also do cloud-init, Ansible or Terraform. Not decided; this ticket covers the image only and is the prerequisite for a thin cloud-init wrapper.

## Edge cases to handle

- A Caddyfile that fails `caddy validate`: nothing is reloaded, the previous files are put back, the run reports it.
- The Caddyfile is a single-file bind mount: unpacking must write into the existing file (or the container must be recreated), otherwise Caddy keeps reading the old inode.
- A Compose file changes while the stack runs: `compose up -d` only then, and never touching `caddy_data` or the databases' volumes.
- Env files and secrets are never in the image and never overwritten by an unpack.
- An older box version being promoted is blocked like the other components (INFRA-17 covers going back).

## Scope change (2026-11-04, owner's decisions in the /workon session)

**Why:** the ticket's purpose is to make a fresh box as small a setup as possible, so what is hand-copied and what ships in the image was made explicit, and the pull of the box image was split from the deploy of the application images.

1. **A new command, `sportconnect-setup`, pulls only the box image.** It logs in through `fetch-secrets.sh`, pulls `sportconnect-box:prod`, installs its files (`~/sportconnect`, `~/web`, `/usr/local/bin`), runs `caddy validate` then `caddy reload`, runs `compose up -d` only when a Compose file changed, and restores the previous files on failure. **`sportconnect-deploy` is not widened**: it keeps pulling the application images (server, chat, client). Run setup when box files change and deploy when the application changes. Setup installs `sportconnect-deploy` from the image, so the self-update risk falls on one file only: setup itself, which is installed by hand (a change to it is a manual `install`, as `sportconnect-deploy` is today).
2. **Hand-copied once per fresh box:** `sportconnect-setup.sh`, `fetch-secrets.sh` (the pull needs the GHCR login that the Vault item gives), `box-prepare.sh` (installs Docker and the firewall rules; Docker must exist before anything can be pulled), and `/etc/sportconnect/secrets.conf` (the Vault OCID; a config file, not a script). Prerequisites that are not shipped: Docker (from `box-prepare.sh`), the `oci` CLI (where it is installed on the box is not checked yet), and the instance-principal policy for the Vault (OCI console, once).
3. **Shipped in the box image:** `sportconnect-deploy`, `start-stack.sh`, `rotate-credentials.sh`, `apply-realm-production.sh`, `backup-postgres.sh`, `install-backup.sh`, `restore-from-bucket.sh`, `restore-test.sh`, `set-admin-pw.sh`, `set-smtp.sh`, `set-web-client-uris.sh`, `set-master-frontend-url.sh`, `set-credentials-client-secret.sh`; `Caddyfile`, `kc-prod.override.yml`, the `*.env.example` templates, the `systemd/` units; the Compose file, init SQL, `create-keycloak-db.sh`, the RabbitMQ config, the realm and themes; both Keycloak JARs (built in CI). (Correction, Phase 2: no realm script under `infra/scripts` runs on the box; the box runs `apply-realm-production.sh` and the `set-*.sh` scripts, which are under `infra/oracle/scripts`. Only `init-chat-db.sql` and `create-keycloak-db.sh` of `infra/scripts` are needed.) A newer `fetch-secrets.sh` may also come in the image and be installed by setup for the next run (to settle at design; the first copy is always by hand). **Never in the image and never touched by an unpack:** `server.env`, `chat.env`, `stack.env`, `~/.kc-admin-pw`, the dot-files, `secrets.conf`.
4. **`box-prepare.sh` is not folded into `sportconnect-setup`** (owner's decision): it is already tested, a fresh box is rare, and Docker's apt install cannot be tested on the Windows development machine.
5. **The box image is private, like the other images** (owner's decision), so setup needs the GHCR login. Making it public would drop `fetch-secrets.sh` from the hand-copied set but expose the realm, Caddyfile and scripts; not chosen.
6. **The PostGIS image stays separate** (`sportconnect-postgis:16-3.6`, `infra/postgis`, its own workflow): it is a runtime image, about 400 MB, with its own change rate and its own verified pipeline. The box image carries the files that name its tag. The tag is pinned in two places, `kc-prod.override.yml` and `rotate-credentials.sh` (`PG_CLIENT_IMAGE`); the box build checks that they match. A PostGIS bump is then a new box release plus `sportconnect-setup`, and Compose recreates the database container.

**A fresh box then needs:** the console and DNS steps (guide sections 1 and 2); `scp` of the three scripts and `secrets.conf`; `box-prepare.sh`; `fetch-secrets.sh`; `sportconnect-setup`; `start-stack.sh`; `sportconnect-deploy`. This replaces the `tar` bundle, the hand-placed Caddyfile and the JARs built on a computer.

7. **Three more decisions after the Phase 2 findings (2026-11-04, owner: "as your suggestion"):** (a) the OCI CLI install moves into `box-prepare.sh`, because `fetch-secrets.sh` needs `oci` to read the Vault and the Vault gives the GHCR login that the pull needs, so a script that arrives inside the image cannot install it (`install-backup.sh` keeps a skip-if-present check); (b) `promote-check.sh` gates the box on the `box-image` workflow run (the box has no test suite of its own; that workflow runs `infra/scripts/verify-box-image.sh`) and tells the owner to run `sportconnect-setup`; (c) `fetch-secrets.sh` is replaced from the image only after a successful install, as the last step. Also found in Phase 2: `infra/keycloak/providers/` holds the git-ignored Google OAuth secret JSON, so the image is built from an allow-list (`infra/box/Dockerfile.dockerignore`), never from a copy of `infra/`, and `verify-box-image.sh` fails the build if a secret-looking file is inside. `/release` can release `box` but never includes it in "all".

**Added to Out of scope:** folding `box-prepare.sh` into setup; a self-updating `sportconnect-setup`; a public box image.

**Estimate:** unchanged for now (2 to 3 days); the new script replaces the planned `sportconnect-deploy` extension, and the restore logic moves with it. Re-check at design.

## Scope

1. The image and its build workflow (JARs built in CI), with a local `docker build` check.
2. `promote.yml` and the promote scripts accept `box`.
3. `sportconnect-setup` (new; see Scope change) pulls, unpacks, validates, reloads and restores; `sportconnect-deploy` keeps the application images only; tested against a throwaway registry, then run for real on the box.
4. Guide: replace the manual bundle step (section 3) and the Caddyfile-change step with the pull-based flow; change-history row; box log rows.

**Out of scope:** folding `box-prepare.sh` into setup, a self-updating `sportconnect-setup`, a public box image (all 2026-11-04); secrets and the Vault/SOPS fetch (INFRA-14); DNS and the OCI console; the first GHCR login and the one-time realm scripts; a custom Keycloak image with the JARs, theme and realm baked in (INFRA-14); cloud-init, Ansible and Terraform (costed above, not chosen).

**Tests / docs:** local registry test of the deploy extension (including a failing `caddy validate` and the restore); a real run on the box recorded in the INFRA-3 rebuild log; `PRODUCTION_DEPLOYMENT_GUIDE.md` and its change history; `PORTS.md` unchanged unless a port moves.

## What was built (2026-11-04) and what is proven

**Files:** `infra/box/Dockerfile`, `Dockerfile.dockerignore` (the allow-list) and `BOX_VERSION` (`0.0.0`, the placeholder, so merging this PR releases nothing); `.github/workflows/box-image.yml`; `infra/scripts/box-version.sh`, `box-image-plan.sh`, `verify-box-image.sh`, `test-sportconnect-setup.sh`; `infra/oracle/scripts/sportconnect-setup.sh`; changed: `promote.yml` and `promote-check.sh` (component `box`; the CI gate is the `box-image` workflow; the next step is `sportconnect-setup`), `box-prepare.sh` (installs the OCI CLI), `install-backup.sh` (comment only), `start-stack.sh` (header and closing hint), `/release` (`box`, never in "all"), the guide (sections 3, 9, 15, 16, 17, history row).

**Design points that changed or were found while building:**
- `sportconnect-setup` stages first and installs second, in a fixed order with a restore of everything it touched; `--plan` is a full dry run (it pulls and stages, installs nothing); it never restarts Keycloak (it prints the command) and never replaces itself.
- The two JAR stages of the Dockerfile run on the build machine (`--platform=$BUILDPLATFORM`), so the arm64 image is not built under emulation.
- The login theme compiles the client's own files: the theme stage needs `client/src`, `client/public` and the client's packages (two failed builds found it), and a change to those files also builds the box image.
- `verify-box-image.sh` reads the executable bit and the line endings inside the image: on Windows a bind mount keeps neither, and Git Bash's `grep` drops a CR from a pattern.

**Proven (my own runs on the development computer, 2026-11-04):**
- `docker build` of the image (18 MB); `verify-box-image.sh` passes on it; nine deliberate defects (another PostGIS tag, a `client_secret_*.json`, an `.env`, CRLF, a missing JAR, a corrupt JAR, an invalid Caddyfile, a lost executable bit, a broken Compose file) were each caught.
- `test-sportconnect-setup.sh`: 43 cases with a stand-in `docker`, all pass; four deliberate breakages of `sportconnect-setup.sh` (a Caddyfile replaced instead of written in place, no secret scan, no file restore, no compose restore) were each caught.
- One real run of `sportconnect-setup` in a Linux container against the real image in a throwaway local registry: the real `buildx imagetools inspect`, pull, staging, `caddy validate` and `docker compose config`; `--plan`, then the install (files, Caddyfile, `sportconnect-deploy`, state file; an existing `server.env` untouched), then a second run that said it was up to date.
- `promote-check.sh` with a stand-in `docker` and `gh`: `box` is accepted, the CI lookup asks for `box-image.yml`, an unknown component is refused. (The "run `sportconnect-setup`" sentence of the summary was not exercised: the stand-in gave a no-change promote.)
- `box-version.sh check` and `box-image-plan.sh` were run locally.

**Proven on GitHub and on the A1 box (2026-11-05, owner's pasted outputs):**
- The release run of `0.1.0` (PR #407): built and pushed both architectures, tags `0.1.0`, `latest`, `edge`, `sha-245eeb7` and `box-v0.1.0`; `imagetools inspect` listed amd64 and arm64; the package is linked to the repo.
- `/release box minor` and the promote of `box` (`none -> 0.1.0`, the first job found the `box-image` run, `prod` -> `sha256:f7b47b8c9632…`). One defect found: the promote's "Done" line said to run `sportconnect-deploy` for the box; fixed to `sportconnect-setup` in `promote-apply.sh` (own branch).
- `sportconnect-setup` on the A1 box: `--plan` (13 files, no Caddyfile or Compose change), the install (private GHCR pull, five steps, `installed: box 0.1.0`), a second run `unchanged`, `.setup-state` correct; then Keycloak restarted and the login worked with the CI-built JARs.

**Fresh box (2026-11-05, my commands over SSH on a new A1):** `box-prepare.sh` incl. the OCI CLI, `fetch-secrets.sh` + GHCR login, `sportconnect-setup` full install with a real `compose up -d`, second run `unchanged`; Caddy with the real hostnames fails as expected, with a throwaway name on Let's Encrypt staging all three certificates were obtained. Defect found and fixed: `start-stack.sh` waited forever for Keycloak on a new box (its role is created by `rotate-credentials.sh postgres`); now a two-minute wait, a warning and Caddy.

**Fresh box, later the same day (2026-11-05):** `rotate-credentials.sh postgres|rabbitmq|check` passed; Keycloak started and its realm answered about 30 s later; `sportconnect-deploy` deployed server, chat and client; `start-stack.sh` ran to the end; the failure path of `sportconnect-setup` against real services (all five steps, probe failed, three files restored byte for byte, no container recreated, exit 1) and then the success path (real `caddy reload`, `compose up -d`, `sportconnect-deploy` install) ran. Second defect found and fixed: `CADDY_PROBE_URL=""` did not skip the check in `sportconnect-setup` and `sportconnect-deploy` (`:-` replaces an empty value); test case 7b added and mutation-checked (fails with the old form; 44 tests pass).

**The patch release `0.1.1` and the live box (2026-11-05, owner's pasted outputs):** "Check the image" passed all seven checks, retention said `nothing to delete`, the promote's summary named `sportconnect-setup`; on the live box `sportconnect-setup --plan` listed four files, the install ran, the second plan said `unchanged`, `.setup-state` held the `0.1.1` digest: a changed `sportconnect-deploy` was installed over a different one with no downtime. Not seen: the install output, `sportconnect-deploy --plan` afterwards, the installed command's checksum.

**Not proven yet (in this order):**
1. Retention actually deleting a version (the `0.1.1` run printed `nothing to delete`; the token's right to delete is unproven until there are more than ten `sha-*` builds). The "Check the image" step and the retention step were read for `0.1.1` and passed (below).
2. A Compose change that recreates a container (known and untested, accepted by the owner 2026-11-05; the rehearsal changed only comments). Watch for the first box release that changes a Compose file: the plan's effects line names it.
3. The realm steps and the restore on a fresh box (guide section 17); the rehearsal instance was terminated before them.
4. Retire the manual `tar` bundle from guide section 3 once 3 has worked.

**i18n / enums / account lifecycle:** none (no endpoint, no text, no enum).
