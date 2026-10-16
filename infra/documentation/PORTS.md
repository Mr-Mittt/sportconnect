# Ports registry

One list of every TCP port SportConnect uses on a developer machine, in CI, and as a container port. **Before a new service, container, dev server or test harness picks a port, check this file, pick a free one, and add it here in the same change.** Two services on one default is silent until someone runs both: the chat service's default `:8081` was Keycloak's port for weeks after INFRA-13 added Keycloak, and `/api/chat` in dev quietly reached Keycloak (CHAT-19).

Last verified: 2026-10-16 (CHAT-17/19).

## Dev machine (host ports)

| Port | What | Defined in | Notes |
|---|---|---|---|
| 5173 | Vite dev server (`pnpm dev`) | `client` (Vite default) | proxies `/api` → 8080, `/api/chat` → 8090 |
| 5174 | Vite dev server for Playwright `e2e` / `visual-regression` | `client/playwright.config.ts` | `--strictPort`; MSW-style mock backend, never the real one |
| 5175 | Vite dev server for the real-Keycloak e2e | `client/playwright.keycloak.config.ts` | allowed as a redirect origin by `redirect.spec.ts` |
| 5432 | Postgres + PostGIS (`sportconnect_dev`, `sportconnect_chat_dev`, `keycloak`) | `infra/docker-compose.dev.yml` | |
| 5672 | RabbitMQ AMQP | `infra/docker-compose.dev.yml` | |
| 6006 | Storybook (client) | `client/package.json` | |
| 6007 | Storybook for the Keycloak theme; also the static server Playwright serves its build from | `client/keycloak-theme/package.json`, `client/playwright.config.ts` | |
| 6379 | Redis | `infra/docker-compose.dev.yml` | shared by Spring and chat (sync stream) |
| 8025 | Mailpit web UI | `infra/docker-compose.dev.yml` | |
| 1025 | Mailpit SMTP | `infra/docker-compose.dev.yml` | |
| 8080 | Spring Boot backend | `server/.../application-dev.yml` | |
| 8081 | Keycloak (dev Compose), admin/admin | `infra/docker-compose.dev.yml` | login pages, JWKS; scripts default to it (`KEYCLOAK_URL`) |
| 8082 | Keycloak for the real-Keycloak e2e (throwaway container) | `infra/scripts/run-keycloak-e2e.sh` (`KEYCLOAK_E2E_PORT`) | |
| 8090 | Chat service (Go) | `services/chat/internal/config/config.go` (`CHAT_HTTP_ADDR`) | not 8081 |
| 8613 | RabbitMQ STOMP (host side of container 61613) | `infra/docker-compose.dev.yml` | deliberately not 61613, see below |
| 9876 | Playwright mock backend (MSW-style server) | `client/e2e/mocks/mockServerConfig.ts` (`MOCK_SERVER_PORT`) | |
| 15672 | RabbitMQ management UI (guest/guest) | `infra/docker-compose.dev.yml` | |

Free and meant for the next service: **8091 to 8099** (take the next one in order and add the row).

## Container / production ports

| Port | What | Defined in | Notes |
|---|---|---|---|
| 8090 | Chat container | `services/chat/Dockerfile` (`EXPOSE`) | must match `CHAT_HTTP_ADDR`; INFRA-7 routes `/api/chat/**` to it |
| 8080 | Spring container | the server image | |

Production reverse-proxy and Keycloak production ports are decided by INFRA-3/INFRA-14; record them here when they exist.

## Rules for picking a port

1. **Grep before choosing:** `git grep -n -E ":<port>\b|<port>:" -- . ':!documentation/sessions'` and read the table above. A port that is free in the repo can still be taken on your machine: `netstat -ano | findstr :<port>`.
2. **Stay out of the Windows dynamic ranges.** Hyper-V/WSL reserve blocks of high ports at boot, and a bind inside one fails at random (this is why STOMP is on 8613, not 61613). Check `netsh int ipv4 show excludedportrange protocol=tcp`; on 2026-10-16 the excluded blocks started at 49690, so anything below 49152 is safe, and so is the 8090 to 8099 band.
3. **One default, one place.** The port lives in the service's config default; every other file (Vite proxy, Dockerfile `EXPOSE`, README, CORS lists) follows it. When a default changes, `git grep` the old number.
4. **Test harness ports are real ports too:** give each Playwright project and mock server its own and use `--strictPort`, otherwise a stray process makes the runner poll the wrong server (documented in `client/playwright.config.ts`).
5. **Add the row in the same change** that introduces the port, and update the CORS origin lists (`server/.../application-dev.yml`, Keycloak web origins) when it is a browser-facing origin.
