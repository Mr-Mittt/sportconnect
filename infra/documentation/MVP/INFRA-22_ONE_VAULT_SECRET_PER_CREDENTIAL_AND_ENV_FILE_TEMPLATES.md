# INFRA-22 · One Vault secret per credential, and env files built from templates

**Status:** `TODO`
**Type:** Infrastructure
**Depends on:** INFRA-14 (the Vault and `fetch-secrets.sh` exist and are proven). Related: INFRA-19 (the box config image could carry the templates).
**Filed:** 2026-11-04, from the owner's question during INFRA-14's live rotation: changing one CORS origin meant copying `server.env`, editing it, encoding it and pasting the whole file back into the Vault, and the Redis, database and internal secrets must be identical in several files with nothing to enforce it.

Today the Vault holds four secrets that are whole files (`sportconnect-prod-server-env`, `-chat-env`, `-stack-env`, `-kc-admin-pw`), plus `-ghcr-token` (one line). This ticket makes each credential its own Vault secret (a plain string: `brevo-smtp-key`, `redis-password`, `sc-app-db-password`, and so on), and turns the env files into templates in the repository: the non-secret settings are written in the template and reviewed in git, and each secret is a placeholder. `fetch-secrets.sh` builds the finished files into tmpfs from the templates and the secrets, as it writes them today. The scripts that read the files (`rotate-credentials.sh`, `apply-realm-production.sh`, `sportconnect-deploy`, Compose) stay unchanged.

Gains: a rotation is one secret and one new version; a value used in several files has one source; non-secret settings such as `CORS_ORIGINS` leave the Vault and get a history; each secret has its own versions.

**Entry point:** `fetch-secrets.sh` on the box; the owner's console edits for rotations.

**Edge cases to settle at pickup:** a placeholder with no secret, and a secret that no template uses, must both fail loudly (never an empty value); migration with the box live (keep the four bundle secrets as a fallback until the new fetch is proven, then retire them); the number of secrets against the Always Free limit (not verified: read it in the console first); whether the SOPS backend keeps parity or is retired; the placeholder syntax; where the templates live until INFRA-19 exists.

**Out of scope:** letting the box write to the Vault (its policy stays read-only); rotating the credentials-client and internal service secrets (the owner's decision of 2026-11-04: set once, kept); the rotation subcommands of INFRA-14 (`smtp`, `ghcr`, `keycloak-admin`), which work with either layout because they read the finished files.

**Tests:** `fetch-secrets.sh` in a Linux container with a fake `oci`: a full build, a missing secret, an unused secret, a changed value in one place reaching every file, and the fallback to the old bundles; `docker compose config` with the built `stack.env`; then a real fetch on the box compared byte for byte with the current files (`cmp`). Docs: the guide's section 18 (A to D) and `SECRETS.md` (the "where it is used" column becomes secret names) in the same change.
