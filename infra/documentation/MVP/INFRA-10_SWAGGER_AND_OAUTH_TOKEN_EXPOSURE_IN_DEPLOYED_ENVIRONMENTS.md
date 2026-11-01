# INFRA-10 · Swagger UI, `/api-docs` and `oauth-token` exposure in deployed environments

**Status:** `DONE` (2026-11-01, box check pending a server release) · **Type:** Infrastructure (security) · **Dependency:** INFRA-3 (hosting decision),
INFRA-7 (reverse-proxy config) — decide alongside them.

**Origin:** found during auth **A7** (audit of the public API surface, 2026-10-08). `SecurityConfig`
permits `/swagger-ui/**`, `/swagger-ui.html`, `/api-docs/**` and `/v3/api-docs/**` in **every**
profile, and `POST /api/auth/oauth-token` (the `@Hidden` Swagger "Authorize" helper, which just calls
`AuthService.login`) is public by nature — it issues tokens exactly like `/api/auth/login`. In dev
that is the point; in a deployed environment it publishes the full endpoint catalogue and a second
login surface to the internet. A7 kept all of these public (they are not a per-endpoint gating
question) and handed the environment decision here.

**What ships (decide in Phase 1):**
- Whether Swagger UI / `/api-docs` are served at all in the deployed profile — e.g. disable via
  `springdoc.api-docs.enabled` / `springdoc.swagger-ui.enabled` in the prod profile, or block the paths
  at the INFRA-7 reverse proxy, or leave them on behind basic auth.
- If Swagger is off in prod, `oauth-token` has no caller there: disable it with the same switch (a
  profile- or property-conditional controller) or block it at the proxy.
- Note the dependency on auth **A5** (rate limiting, now V1): until it ships, `login` and `oauth-token`
  are both unthrottled, so removing the second surface matters more, not less.
- Done when: the deployed profile's behaviour for these four paths is decided, applied, and verified
  from *outside* (an external request to `/swagger-ui.html` and `/api/auth/oauth-token` against the
  deployed domain), not assumed from config.

## Delta 2026-11-01: `oauth-token` no longer exists

Auth A28 removed `POST /api/auth/oauth-token` (and `login`) when sign-in moved to Keycloak; Swagger's Authorize now signs in at Keycloak through the realm client `sportconnect-swagger` (`OpenApiConfig`). The "second login surface" half of this ticket is therefore already closed, and nothing here touches it.

## Decisions (2026-11-01)

- **The deployed (`prod`) profile does not serve the Swagger UI or the OpenAPI document** (option a of three: off in the server; blocking at Caddy only, or both, were the others). `application-prod.yml` sets `springdoc.api-docs.enabled` and `springdoc.swagger-ui.enabled` to `false`; dev and tests keep the defaults (on).
- **`SecurityConfig` names a Swagger path as public only while its feature is on.** With both off, nothing is `permitAll` for them and an anonymous call gets the filter chain's 401 like any unknown path (before: `permitAll` in every profile, so the dispatcher answered 404 and the paths looked deliberately open). The matcher is a small `RequestMatcher` built from the two flags, so "nothing public" is an ordinary result.
- **No Caddy rule added.** From the internet these paths already fall through to the client page (no rule matches), which `verify-internal-isolation.sh` checks; adding a rule would only duplicate the server switch. Revisit if a catch-all proxy rule is ever added (INFRA-9's explicit `/internal` refusal is the model).
- **Left as is:** `GET /api/info` still returns `"documentation": "/swagger-ui.html"` (authenticated, no consumer in the client, e2e or tests); in prod the link is dead.
- **Not needed on the box:** the owner chose to switch Swagger off in prod (option a), so nothing there needs it.

## Implementation summary (2026-11-01)

- `server/src/main/resources/application-prod.yml`: the two springdoc flags set to `false`.
- `modules/auth/auth-impl/.../SecurityConfig.java`: `springdoc.swagger-ui.enabled` and `springdoc.api-docs.enabled` (default `true`) read with `@Value`; `swaggerPublicPaths()` returns the UI paths only while the UI is on and the document paths only while the documents are on.
- `infra/scripts/verify-internal-isolation.sh`: also probes `/swagger-ui/index.html` and `/api-docs/swagger-config` (they return the client page from outside, before and after the change).
- Docs: guide section 10 ("Swagger and the API catalogue (INFRA-10)" plus a change-history row), INFRA-14 note on the production realm client, backlog, `PROGRESS.md`.
- Census: no consumer of these paths in the client, e2e mocks or tests; Caddy and the verify script already expect the client page. Endpoint contracts, DTOs, enums and client copy are unchanged, so no client ticket is needed. Account lifecycle: no new authenticated path.

## Verification

- **Server tests (scoped, run by Claude):** `SwaggerExposureDisabledIntegrationTest` (2 tests: the three UI paths and the three document paths get the filter-chain 401 with the flags off), `SwaggerExposureEnabledIntegrationTest` (2: `/api-docs` serves the OpenAPI document and `/swagger-ui.html` is reachable with the defaults), `ProdProfileSwaggerSettingTest` (1: the real `application-prod.yml` has both flags `false`), and the existing `PublicSurfaceAccessIntegrationTest` (10) all pass.
- **Mutation checks (run by Claude):** with the matcher forced "on" and the prod flags set to `true`, the two disabled tests and the prod-file test failed (3 of 5) and the enabled tests stayed green; with the matcher forced "off", both enabled tests failed (2 of 4) and the disabled ones stayed green. Files restored and the 5 tests re-run green.
- **Outside, after the change:** the paths return the client page both before and after (no rule in Caddy), so that proves nothing new; `verify-internal-isolation.sh` with the two new probes was run by Claude against the live site on 2026-11-01 with the two new probes: all checks passed (the five Swagger/api-docs paths answered the client page, `200`).
- **Conditional, not run yet:** the change reaches the box only with a server release (`/release server patch`), a promote and `sportconnect-deploy`. After that deploy, on the box: `docker exec sc-caddy wget -S -O /dev/null http://sc-server:8080/api-docs 2>&1 | head -1` and the same for `/swagger-ui.html` must show `401` (before the deploy they show `200`). That release also gives INFRA-6's pending box check 9 (failure and restore) something to deploy. Record the result in the INFRA-3 rebuild log.

**Note (INFRA-9, 2026-11-01):** if the decision is to block these paths at the proxy, the Caddyfile change procedure now exists (guide section 10, "Changing the Caddyfile and the isolation check"), and `infra/scripts/verify-internal-isolation.sh` already expects `/swagger-ui.html`, `/api-docs` and `/v3/api-docs` to return the client page; change those expectations in the same ticket if they should become 404.
