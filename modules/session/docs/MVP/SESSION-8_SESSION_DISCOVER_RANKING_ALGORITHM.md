# SESSION-8 · Session discover ranking algorithm

**Filed:** 2026-08-03. `GET /api/sessions/discover` (SESSION-4) currently sorts results by a plain
`scheduledStart ASC` (`@PageableDefault` on the controller, client-overridable via `?sort=` like
any Spring Data `Pageable`) — soonest-first, nothing else. This ticket replaces that with a real
ranking algorithm so the sessions most relevant to the caller surface first, rather than just the
next chronological one.

Signal candidates to evaluate at pickup (not predetermined — confirm against what data actually
exists before committing to any of these): distance from the caller to the session's location,
match between the session's sport and the caller's `UserSportProfile` (e.g. skill level), how full
the session is (`participantCount` vs `capacity`), how soon it starts. Exact scoring formula,
which signals make the cut, and SQL-side vs in-app scoring is this ticket's design decision.

**Deferred (2026-08-03):** paused at Phase 1 pending the client-side discover UI work — pick up
scoping again once there's a concrete UI to design the ranking against. Groundwork from the
Phase 1/2 discussion so far, worth reading before re-scoping:
- No `ST_Distance`/`ST_DWithin` geo-distance query exists anywhere in the codebase yet — a true
  proximity signal would be new plumbing (`User.location`/`Location.location` are both
  `geography(Point,4326)`, but nothing queries distance on them today).
- `User.city`/`User.country` (`modules/user/user-impl/.../entity/User.java:78-82`) already exist
  as plain free-text columns, set directly from `UpdateProfileRequest` with no normalization/
  reverse-geocoding — usable as a coarse, zero-new-infra proximity signal ("same city") without
  touching PostGIS, at the cost of being typo/format-inconsistent ("NYC" vs "New York").
- OpenStreetMap's Nominatim could auto-detect/normalize `city`/`country` from `location`
  (self-hosted or the public rate-limited API), but that's data-quality work that belongs on
  `modules/user`, not this ticket — a separate ticket if/when it's wanted, not a prerequisite here.
- `UserSportProfile.skillLevel` (`modules/sport/sport-impl/.../entity/UserSportProfile.java:46-47`)
  is free-text, not an ordered enum — a skill-match signal starts as exact-string-match only.
- `participantCount` (fill-rate signal) is computed post-query in `mapToResponses`, not a raw SQL
  column — ranking on it means either moving that computation earlier or paginating in-app.
- No weighted/multi-factor ranking precedent exists elsewhere in the codebase (the closest is the
  personalized feed's flat `ORDER BY lastInteractionAt DESC`) — whatever this ticket builds sets a
  new pattern, not a copy of an existing one.
- Also unresolved: whether combining signals should be a tiered priority sort (simple, stays
  SQL-`ORDER BY`-compatible with `Page`/`LIMIT`-`OFFSET` pagination) or a weighted composite score
  (more flexible, real added complexity to keep DB-side-paginatable).
