# INFRA-10 · Swagger UI, `/api-docs` and `oauth-token` exposure in deployed environments

**Status:** `TODO` · **Type:** Infrastructure (security) · **Dependency:** INFRA-3 (hosting decision),
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
