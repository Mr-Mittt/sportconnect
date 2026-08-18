# INFRA-9 · `/internal/**` network isolation

**Status:** `TODO` · **Type:** Infrastructure (security) · **Dependency:** INFRA-3 (at minimum);
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
