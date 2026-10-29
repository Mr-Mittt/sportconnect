# INFRA-16 · Evaluate distroless base images for the server and client images

**Status:** `TODO` · **Type:** Infrastructure (hardening, artifact-scoped) · **Depends on:** none hard; do it after INFRA-6, so the deploy health probe and the run flags are known

**Filed:** 2026-10-29, from the INFRA-8 Phase 1 discussion of which images are distroless. Only the chat image is (`distroless/static-debian12`); the server runs on `eclipse-temurin:21-jre` (Ubuntu, with a shell and `curl`) and the client on `alpine:3.20`.

## What

Decide, and if it is worth it do, a move to distroless bases. The two images are different cases.

**Server.** Could be `gcr.io/distroless/java21-debian12:nonroot` (or an equivalent minimal JRE image). The gain is a smaller image and fewer OS packages for a vulnerability scanner to flag; the server already runs as non-root (`app`, UID 10001). Things to resolve at pickup, because distroless has no shell, no `curl` and no `RUN`:

- **Health check.** `server/Dockerfile` has a `HEALTHCHECK` that runs `curl` against `/actuator/health`. Without `curl` the image has no check of its own; INFRA-6's rollback must then probe from outside the container (if INFRA-6 already does, this cost is zero).
- **Log directory.** `application-prod.yml` writes to `/var/log/sportconnect`, which the Dockerfile creates and chowns with a `RUN`. Create it in the build stage and `COPY --chown`, or log to stdout.
- **Debugging.** No `docker exec ... sh` on the production box. The `:debug` variant adds busybox but is not the production image.
- **Libraries.** Check the app for anything needing OS libraries a distroless image lacks (image or font handling).
- **Re-verification.** Repeat the INFRA-15 step 2 boot test (startup line, `prod` profile, health, Swagger version) on the new base.

**Client.** Cannot be converted as it stands. The image is a data-only carrier whose contract (INFRA-5, used by INFRA-6) is that running it copies the build into a volume with `sh -c "rm -rf /srv/* && cp -a /dist/. /srv/"`; distroless has no `sh`, `rm` or `cp`. A conversion means changing that contract (for example a tiny static copy binary, or serving the files from the image, which contradicts "Caddy serves the volume"). The image runs no service and holds no secrets, so there is little to harden. The expected outcome is to close the client half as "won't do" unless a real reason appears; decide at pickup.

**Do first, cheaper (INFRA-6):** harden the `docker run` flags (`--cap-drop ALL`, `--security-opt no-new-privileges`, `--read-only` with a writable tmpfs or volume for the log directory). That limits a compromised process without changing the image or losing the health check and the shell. Measure what distroless still adds after that (for example a vulnerability scan before and after, and the image size).

**Out of scope:** the chat image (already distroless, INFRA-8), the run flags themselves (INFRA-6), the Keycloak, Postgres, Redis and RabbitMQ images.

**Tests:** the INFRA-15 step 2 boot test on the new server image; for any change, the labels still correct and a size comparison; `actionlint` on any workflow touched.

**i18n / enums / account lifecycle:** none; no API, no user-visible text.
