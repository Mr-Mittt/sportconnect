# INFRA-9 · `/internal/**` network isolation

**Status:** `DONE` (2026-11-01) · **Type:** Infrastructure (security) · **Dependency:** INFRA-3 (at minimum);
possibly INFRA-7
**Spec:** `services/chat/docs/SYNC_DESIGN.md`'s cold-start bootstrap section

**Origin:** `/internal/sync/**` (the server's endpoints the chat service's cold-start bootstrap
pulls from) is gated by a shared-secret header at the application layer
(`InternalServiceAuthFilter`), but nothing today prevents an external caller from reaching that
path at all — the secret is the only thing standing between the public internet and a full data
dump of group memberships/friendships/user profiles. Application-layer auth was always meant to be
the second layer, not the only one — see the explicit call-out in `SYNC_DESIGN.md`.

**What ships:**
- Either (or both, decide in Phase 1): an EC2 security-group rule that simply never exposes the
  server container's port to anything but the reverse proxy and other containers on the same
  Docker network: or an explicit `location /internal/ { deny all; }`-style block in the INFRA-7
  reverse-proxy config, so even if the security group is ever loosened, the proxy itself refuses to
  forward the path externally.
- Verify from *outside* the VPC/security group (not just "the app returns 403 for a bad secret,"
  which is a different, already-covered case) that `/internal/**` is genuinely unreachable — e.g.
  attempt a real external request against the production domain's `/internal/sync/group-members`
  and confirm it never even reaches the application (connection refused/timeout, not a 403 from the
  app).
- Done when: that external-reachability check is performed and documented, not just assumed from
  the security-group rule existing.

## Delta 2026-10-27 (INFRA-3 / INFRA-12): isolation on Oracle

There is no EC2 security group; the equivalents are the VCN security list (only 22, 80, 443 ingress) and Ubuntu's iptables, plus Docker: the server (8080) and chat (8090) are **not published** to the host and Caddy does not proxy `/internal`, `/actuator` or Swagger (verified from outside on the sandbox: they fall through to the client's `index.html`). The backing services are published on `127.0.0.1` only (Docker's NAT ignores Ubuntu's INPUT rules, so the loopback binding is the real protection). Remaining for this ticket: an automated check that `/internal/**` is unreachable from outside, and deciding whether the `/internal` secret check stays as a second layer.

## Decisions (2026-11-01)

- **Explicit refusal in the proxy, in addition to isolation by omission.** Until now `/internal/**` was unreachable only because Caddy had no rule for it, so it fell through to the client (`200 index.html`); a later broad rule (for example a catch-all proxy to the server) would have exposed it silently. `infra/oracle/Caddyfile` now has `handle /internal/* { respond 404 }` as the **first** block of the main site. Caddy matches paths without regard to case and removes dot segments first, so `/INTERNAL/` and `/api/../internal/` land in it too.
- **The application's shared-secret check stays** (`InternalServiceAuthFilter`, no default secret in the prod profile) as the second layer. Chat reaches `/internal/sync/**` over the Compose network (`sc-server:8080`), never through Caddy, so the refusal does not touch the bootstrap.
- **No network change.** The VCN security list (22, 80, 443), iptables and the unpublished server (8080) and chat (8090) ports already hold; the check below proves it from outside.

## Implementation summary (2026-11-01)

- `infra/oracle/Caddyfile`: the `/internal/*` block above (comment-stripped hash `7cd9ff420cae9e2564c3ccf15ae494fc9934bf60193c0998cbd22da794c93c3c`).
- `infra/scripts/verify-internal-isolation.sh [host]`: read-only check from outside. `/internal/**` variants (three sync endpoints, `/internal/`, case, `/api/../`, `/ws/../`, `/images/../`, and a POST) must answer 404 and not JSON; `/actuator/*`, Swagger and `api-docs` must return the client page; `/api/internal/…` must give the application's 401; the auth host's `/internal` gives 404; TCP connects to 8080, 8090, 8081, 5432, 6379, 5672, 15672, 61613, 25 and 8025 on the public address must fail. `EXPECT_INTERNAL_CODE=200` checks a pre-INFRA-9 Caddyfile, `CHECK_PORTS=0` skips the port checks. Sends no secret.
- Guide: "Changing the Caddyfile and the isolation check (INFRA-9)" in section 10 (the first documented run of the single-file procedure), section 10's table row for `/internal/x`, change-history row.
- Box log rows 31 and 32.

## Verification

- **Before** (old Caddyfile, run by Claude against the live site with `EXPECT_INTERNAL_CODE=200`): all 25 lines passed, the `/internal` variants answering `200 index.html`. In default mode the same script printed 10 FAIL lines and exited 1, so it detects a missing rule.
- **Local Caddy test** (the real Caddyfile in `caddy:2-alpine`, stand-in upstreams, plain-http addresses): `caddy validate` valid; 11 `/internal` variants (including `/%69nternal/` and `//internal/`, and a POST) answered 404; `/api/*`, `/api/chat/*` (prefix stripped), `/ws`, `/images/*`, `/api/internal/…` and `/api/chat/internal/…` still reached their upstreams; `/actuator/health`, `/swagger-ui.html` and unknown routes got the client page.
- **On the box** (owner's word, output not pasted): `caddy validate` on `Caddyfile.new`, the in-place copy, `caddy reload` and the hash check all done ("all done").
- **After** (run by Claude from a computer against the live site, default mode): **all 25 lines passed** — the `/internal` variants and the POST answered 404, `/actuator/*`, Swagger and `api-docs` the client page, `/api/internal/…` 401, the auth host 404, and the ten ports closed or filtered on `207.211.144.208`.
- Not run: a request that carries a valid internal secret through the proxy (by design now 404); chat's bootstrap after the reload was not re-observed (it does not use Caddy).

**Follow-up:** INFRA-10 (Swagger, `api-docs`, `oauth-token`) can reuse the same Caddyfile procedure; a note was added there.
