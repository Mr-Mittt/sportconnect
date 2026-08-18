# SESSION-1 · Session domain core (manual only)

New `modules/session` domain. A `Session` is a scheduled sports activity — group-linked
(`groupId` set, owner/admin-gated) or standalone (`groupId` null, open to any user). Always
references a `Location` (`modules/location`) by id, validated to be for the same sport as the
session, plus an optional free-text `locationNote` (e.g. "Court 3") scoped to the session itself.
Minimal `SessionParticipant` join/leave. Deliberately excludes recurrence/auto-generation — see
SESSION-2. See `documentation/md/SESSION_LOCATION_DESIGN.md` for the full design context.

**Endpoints:**
```
POST   /api/sessions                          ROLE_USER
GET    /api/sessions/{id}
GET    /api/sessions/group/{groupId}          paginated, private-group visibility enforced
GET    /api/sessions/mine                     paginated, caller's standalone sessions
PUT    /api/sessions/{id}                     creator (standalone) or owner/admin (group)
POST   /api/sessions/{id}/cancel               same gating; soft — see SESSION-3
POST   /api/sessions/{id}/join
DELETE /api/sessions/{id}/leave
GET    /api/sessions/{id}/participants        paginated, JOINED-only
```

**Deferred (not part of SESSION-1):** recurrence/auto-generation (SESSION-2), full status
lifecycle/cancellation (SESSION-3), `TOURNAMENT`/`TRAINING` session types (enum values reserved
only), session capacity/waitlist, geo-proximity/nearby session search.
