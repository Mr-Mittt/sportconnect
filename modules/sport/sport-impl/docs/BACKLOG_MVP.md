# Sport Module — Feature Backlog

**Version:** MVP v1  
**Module:** `modules/sport/sport-impl`  
**Last updated:** 2026-07-02

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session
- Mark it `DONE` when implementation + tests are complete
- Use `/workon sport mvp` to resume

---

## Implementation Order

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | A1 | JWT-based identity | `DONE` |
| 2 | A2 | Sport profile ownership check (update + delete) | `DONE` |
| 3 | A3 | Flexible per-sport attributes (JSONB) | `DONE` |
| 4 | A4 | Batch sport lookup in getUserProfiles (cleanliness, not a scaling fix) | `DONE` |

**Dependencies:**
```
No hard dependency between A1 and A2, but both touch SportController.java —
consider doing them in the same session to avoid re-reading the same file twice.
A3: no hard dependency, can run independently.
```

---

## Tickets

### A1 · JWT-based identity
**Status:** `DONE`  
**Type:** Enhancement (Security)  
**Scope:** `SportController.java` only — no service layer changes

Extract `userId` from the JWT principal inside the controller. Remove caller-identity `userId` from request params.

**Required caller ID (1 endpoint) — replace `@RequestParam UUID userId` with `@AuthenticationPrincipal String userIdStr`:**
- `POST /api/sports/profiles` — createProfile

All other endpoints either have no userId param, or use `userId` as a `@PathVariable` identifying the target user (not the caller) — those stay unchanged.

**Reuse:** `SecurityUtils.extractUserId(Authentication)` from `com.sportconnect.common.auth.SecurityUtils` — no new utility code needed.

---

### A2 · Sport profile ownership check (update + delete)
**Status:** `DONE`
**Type:** Bug Fix (Security)
**Scope:** `SportController.java` + `UserSportProfileServiceImpl.java` + `UserSportProfileService.java`
(interface signature change in `sport-api`)

`PUT /api/sports/profiles/{profileId}` and `DELETE /api/sports/profiles/{profileId}` are both
`@PreAuthorize("hasRole('USER')")` only — neither checks that the caller actually owns the profile at
`{profileId}`. Any authenticated user who knows/guesses a `profileId` can currently edit or soft-delete
*anyone's* sport profile. Found while discussing the user module's U2 ticket (same class of bug, just
in this module).

**Fix — same fetch-then-check pattern as `PostServiceImpl.deletePost()`** (the profile has to be
fetched anyway to know who owns it, so the permission check happens after the fetch, not before, unlike
a case where ownership is trivially the input param itself):

**Interface change (`UserSportProfileService`, `sport-api`):**
```java
UserSportProfileResponse updateProfile(Long profileId, UUID callerId, CreateUserSportProfileRequest request);
void deleteProfile(Long profileId, UUID callerId);
```

**Service impl (`UserSportProfileServiceImpl`):** fetch the profile (existing
`ResourceNotFoundException` if missing, unchanged), then check `profile.getUserId().equals(callerId)`;
throw `ForbiddenException` on mismatch; otherwise proceed with the existing update/soft-delete logic
unchanged.

**Controller (`SportController`):** add `@AuthenticationPrincipal String userIdStr` to both
`updateProfile()` and `deleteProfile()`, pass `UUID.fromString(userIdStr)` through as `callerId`.

**Tests:** self-update succeeds; self-delete succeeds; update by non-owner throws
`ForbiddenException`; delete by non-owner throws `ForbiddenException`; not-found still throws
`ResourceNotFoundException` (checked before the ownership comparison, since the fetch has to happen
first either way).

---

### A3 · Flexible per-sport attributes (JSONB)
**Status:** `DONE`
**Type:** New Feature
**Entities:** `UserSportProfile` (existing entity, add 1 JSONB column)

Split out of a discussion originally framed around the user module's U3 (UserPreference) ticket.
`UserSportProfile` already has fixed columns for generic per-sport data (`skillLevel`,
`yearsOfExperience`, `preferredPosition`, `bio`), but sport-*specific* attributes — e.g. dominant hand
for badminton/tennis, stroke style for swimming — genuinely vary per sport and can't be covered by a
fixed schema without a migration per new attribute per new sport. This ticket's sibling, **U7** in
`modules/user/user-impl/docs/BACKLOG_MVP.md`, covers sport-*agnostic* physical stats (height/weight/
shoe size) instead — deliberately kept as fixed columns there since that set doesn't vary by context.

**Liquibase migration:**
```sql
ALTER TABLE user_sport_profiles ADD COLUMN attributes JSONB DEFAULT '{}'::jsonb;
```

**Entity (`UserSportProfile.java`):** add an `attributes` field mapped to JSONB.

**Open question for implementer:** confirm the exact Hibernate 6.4 + PostgreSQL JSONB mapping approach
(e.g. `@JdbcTypeCode(SqlTypes.JSON)` on a `Map<String, Object>` field) — this is the **first JSONB
column in the codebase**, so there is no existing pattern here to copy; verify library/version support
during Phase 2 explore rather than assuming it "just works" the same as a plain column.

**DTOs (`sport-api`):** add `attributes: Map<String, Object>` (optional) to
`CreateUserSportProfileRequest` and `UserSportProfileResponse`.

**Service impl (`UserSportProfileServiceImpl`):** `updateProfile()` should **merge** new keys into the
existing `attributes` map rather than replacing it wholesale — a sport-specific frontend form only
sends the keys it cares about (e.g. just `dominantHand`) and shouldn't wipe out attributes set by a
different flow.

**Validation:** cap total serialized JSON size (e.g. reject over ~4KB) to prevent abuse; no per-key
schema validation in MVP — the frontend owns which keys make sense for which sport.

**Frontend rendering (documented here, not built in this ticket):** since `attributes` is schema-less
on the backend, the frontend needs its own mapping of `sportId`/category → which attribute keys to
render (e.g. badminton → "Dominant Hand", swimming → "Stroke Style"). Decided: a **static
frontend-side config object**, not a backend-driven `sport_attribute_definitions` schema table — the
latter is a reasonable future upgrade if sports get added often enough to make hardcoding painful, but
is over-engineering for now. A future client-backlog ticket ("static per-sport attribute form config")
should pick this up once this backend ticket lands.

**Tests:** create profile with `attributes` persists them; update merges new keys without dropping
existing ones; oversized payload rejected with `BadRequestException`.

---

### A4 · Batch sport lookup in getUserProfiles
**Status:** `DONE`  
**Type:** Cleanliness (explicitly NOT a scaling fix — see below)  
**Scope:** `UserSportProfileServiceImpl.java` only

**Found while starting A1**, flagged by this module's own `CLAUDE.md` gotcha ("The service fetches
Sport by ID for each profile in getUserProfiles() — potential N+1 on large lists"). Verified before
ticketing: this is **not actually a scaling risk**, unlike the group-impl A7/A8, post-impl A6/A7, and
user-impl U8 tickets from the recent cross-module N+1 audit. `createProfile()` enforces "a user
cannot have more than 3 active sport profiles" (checked via
`profileRepository.findByUserIdAndIsActiveTrue(userId).size() >= 3` before every save), and confirmed
via `grep` that `profileRepository.save()` has no other call site that could bypass this check — so
`getUserProfiles(userId)` can never return more than 3 items, for any user, ever. This is the same
bounded-by-business-rule shape as group-impl's pinned-posts loops (capped at 3), not the same bug
class as a paginated N+1.

**Current code (`getUserProfiles`, ~lines 74-83):**
```java
public List<UserSportProfileResponse> getUserProfiles(UUID userId) {
    return profileRepository.findByUserIdAndIsActiveTrue(userId).stream()
            .map(profile -> {
                Sport sport = sportRepository.findById(profile.getSportId()).orElse(null);
                String sportName = sport != null ? sport.getName() : "Unknown";
                return toUserSportProfileResponse(profile, sportName);
            })
            .collect(Collectors.toList());
}
```

**Why ticketed anyway:** user's explicit call — ticketed for code cleanliness/consistency with the
batching pattern used elsewhere in the codebase, not because of a performance concern. Treat as
low priority relative to A1–A3.

**Fix approach:** collect distinct `sportId`s from the fetched profiles (at most 3, so this is a
tiny batch), one `sportRepository.findAllById(sportIds)` call, build a `Map<Long, String>`
(sportId → name), then map each profile from the pre-resolved map instead of querying per item —
same shape as the batching helpers added in group-impl/post-impl/user-impl, just applied to a
3-item-max list instead of an unbounded page.

**Out of scope:** no change to what data is displayed — same fields/values, same `"Unknown"`
fallback for a missing sport.

---
