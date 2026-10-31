# INFRA-19 · A "box" config image: ship the box's non-secret files by pull, so a fresh or changed box needs no manual file copying

**Status:** `TODO` · **Type:** Infrastructure · **Depends on:** INFRA-6 (done); best done with or after INFRA-14 (it reshapes `start-stack.sh` and the Compose override, which this image would carry)

**Filed:** 2026-11-01, from the owner's question after INFRA-7: apart from the Caddyfile, what else must be copied to a fresh box, and how to make it all automatic. Estimated and costed against the alternatives; the owner has not decided between those yet (see below).

## What

Today the box's non-secret files arrive by hand: a `tar` bundle of `infra/` files (Compose files, init SQL, RabbitMQ config, realm, themes, the two Keycloak JARs built on the owner's computer) plus `Caddyfile` and `kc-prod.override.yml` copied into `~/web` (guide section 3). Changing the Caddyfile is a manual `scp` and a `caddy reload` that has never been run on the box. This ticket makes the box a **fourth deployable component** next to server, chat and client.

- **Build:** a CI workflow (same shape as `client-image`/`chat-image`) builds a data-only image `sportconnect-box` holding every non-secret file, with the Keycloak theme and extension JARs **built in CI** instead of on a computer. Versioned, OCI labels, released on merge like the others.
- **Promote:** `promote.yml` accepts `box` as a component and retags it as `prod` under the same approval gate and checks.
- **Deploy:** `sportconnect-deploy` pulls it, unpacks it into `~/sportconnect` and `~/web` (the way it already fills `dist` from the client image), runs `caddy validate` then `caddy reload`, and runs `compose up -d` only when a Compose file changed. On failure it restores the previous files, as it does for the other components.

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

## Scope

1. The image and its build workflow (JARs built in CI), with a local `docker build` check.
2. `promote.yml` and the promote scripts accept `box`.
3. `sportconnect-deploy` pulls, unpacks, validates, reloads and restores; tested against a throwaway registry, then run for real on the box.
4. Guide: replace the manual bundle step (section 3) and the Caddyfile-change step with the pull-based flow; change-history row; box log rows.

**Out of scope:** secrets and the Vault/SOPS fetch (INFRA-14); DNS and the OCI console; the first GHCR login and the one-time realm scripts; a custom Keycloak image with the JARs, theme and realm baked in (INFRA-14); cloud-init, Ansible and Terraform (costed above, not chosen).

**Tests / docs:** local registry test of the deploy extension (including a failing `caddy validate` and the restore); a real run on the box recorded in the INFRA-3 rebuild log; `PRODUCTION_DEPLOYMENT_GUIDE.md` and its change history; `PORTS.md` unchanged unless a port moves.

**i18n / enums / account lifecycle:** none (no endpoint, no text, no enum).
