# SPORT-18 · Admin screen to edit a sport's result schema

**Status:** `TODO`
**Type:** Feature · **Depends on:** SESSION-50 (session backlog: the admin `GET`/`PUT` result-schema endpoints), ADMIN-2 ·
**Filed:** 2026-11-12, scope change during `/workon session session-50` (the owner chose admin endpoints instead of a seed; this replaces the sport backlog's A26).

Add a result-schema editor to the sport admin master-detail page (ADMIN-2), next to the profile and session attribute schemas: read with `GET /api/sports/all/{sportId}/result-schema`, replace with `PUT /api/sports/{sportId}/result-schema`. The schema describes what a recorded result is for that sport (kind `MATCH`, players per side, record mode, points, labels in en and vi, `maxRecords`). Open for pickup: a JSON text editor like the existing schema documents versus a form. En/vi copy, MSW handlers.

**Out of scope:** the endpoints (SESSION-50); the Result section on the session detail (CLIENT-SESSION-38).

**Tests:** Vitest for the editor and its error display; a scoped admin e2e.
