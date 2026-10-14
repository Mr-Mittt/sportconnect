# INFRA-13 · Keycloak in the dev Compose stack, with the realm as code

**Status:** `TODO` · **Type:** Infrastructure · **Depends on:** none · **Gates:** auth A25, A26, A27, A29; chat CHAT-17

**Filed:** 2026-10-14, from the social-login `/feature` (`documentation/md/KEYCLOAK_SOCIAL_LOGIN_DESIGN.md`).

## What

- A `keycloak` service in `infra/docker-compose.dev.yml` (Keycloak 26.4, its schema in the existing Postgres, a host port that does not collide with 8080), with the providers directory mountable for the A23/A27 JARs.
- The realm as a committed import (`infra/keycloak/`): public client for the web app (PKCE S256, redirect URIs), access-token lifetime **5 min**, an audience mapper for our API, optional `email` / `firstName` / `lastName` in the user profile, en and vi enabled, SMTP pointed at the dev mail sink, Apple and GitHub not configured. **No secrets in the repo**: provider client secrets come from the environment.
- CI: Java and Maven available for the theme and extension builds (A23 measured: Maven must be on PATH).
- Document the commands in `infra/documentation/` and the root CLAUDE.md Commands section.

## Findings to reuse (A23)

Keycloak started in 12 s, about 810 MiB idle in dev mode. In Compose, a provider's back-channel URLs must use the container-internal host, and a pinned `KC_HOSTNAME` keeps issuers consistent.

## Out of scope

Production Keycloak (**INFRA-14**), provider credentials, the extension (A27), the theme (AUTH-15).

## Done when

`docker compose up` brings Keycloak up with the realm imported; the realm file contains no secret; the docs are updated; verified locally with `docker compose config` and a real `up`.
