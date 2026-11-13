# SPORT-18 · Admin screen to edit a sport's result schema

**Status:** `DONE`
**Type:** Feature · **Depends on:** SESSION-50 (session backlog: the admin `GET`/`PUT` result-schema endpoints), ADMIN-2 ·
**Filed:** 2026-11-12, scope change during `/workon session session-50` (the owner chose admin endpoints instead of a seed; this replaces the sport backlog's A26).

Add a result-schema editor to the sport admin master-detail page (ADMIN-2), next to the profile and session attribute schemas: read with `GET /api/sports/all/{sportId}/result-schema`, replace with `PUT /api/sports/{sportId}/result-schema`. The schema describes what a recorded result is for that sport (kind `MATCH`, players per side, record mode, points, labels in en and vi, `maxRecords`). Open for pickup: a JSON text editor like the existing schema documents versus a form. En/vi copy, MSW handlers.

**Out of scope:** the endpoints (SESSION-50); the Result section on the session detail (CLIENT-GL-38).

**Tests:** Vitest for the editor and its error display; a scoped admin e2e.


---

## Scope decision and implementation summary (2026-11-13)

**Status: DONE**, built on the CLIENT-GL-38 branch at the owner's request ("add the record schema update for the admin page, use the same profile attributes and session attributes editor"). The open question above (JSON text editor versus a form) is settled: the same generic JSON editor.

- **What was built:** a third collapsible section, "Record schema", on the sport detail panel of `/admin/sports/:sportId` (ADMIN-2), under Profile attributes and Session attributes. It mounts the existing generic `AttributeSchemaEditor` (textarea, Save, Reset, read-only View, dirty guard for the admin logout) with `fieldId="result-schema"`, label "Record schema document (JSON)" and Save label "Save record schema".
- **Data:** `useResultSchemaAdmin` (`GET /api/sports/all/{id}/result-schema`, resolves for an inactive sport too) and `useReplaceResultSchema` (`PUT /api/sports/{id}/result-schema`; on success it refreshes the admin read and the member read `['resultSchema', sportId]`, so an open session detail picks the change up). `adminKeys.resultSchema` added.
- **One addition to the generic editor:** an optional, non-blocking `documentHint` prop. For the record schema it says "The app cannot read this as a record schema (version 1, record type COMPETITIVE, playersPerSide, score slots), so the Results section stays hidden for this sport until it is fixed. You can still save." whenever `parseRecordSchema` returns `null` for the typed document. The server validates only `maxRecords` (1 to 500) and the 16 KB size, so this is the only place an admin learns that the client cannot read what they saved. It never blocks a Save.
- **No example document (owner, 2026-11-13):** a sport without a record schema shows an empty textarea with a placeholder ("No record schema is stored for this sport ... Paste the schema document (JSON) here and save"), never a pre-filled example: a template looked like stored data (found when the owner saw it and believed badminton already had a schema). `AttributeSchemaEditor` gets `blankWhenEmpty` and `placeholder` props; Save stays disabled until something is typed.
- **Copy:** admin screens are English-only (CLIENT-I18N-6): server text is shown verbatim, no vi keys.
- **Mocks:** `GET /api/sports/all/:id/result-schema` and `PUT /api/sports/:id/result-schema` (refuses a `maxRecords` outside 1 to 500 with `SPORT_RESULT_SCHEMA_INVALID`; stateful per mock session, the member read follows it).
- **Tests:** `AdminSportsPage.test.tsx` +7 (admin path read, empty box with placeholder, a pasted document saves, own save endpoint, server message verbatim, hint without blocking Save, invalid JSON blocks), `useReplaceResultSchema.test.tsx` 2 (both reads refreshed, error text), `AdminLayout.test.tsx` +1 (unsaved record-schema edits warn on logout, section collapsed); admin suite 46 tests passed. 7 requirement mutations (admin read path, save path, either read not refreshed, hint never / always shown, logout guard) all killed; the guard mutant survived until its test was added.
- **E2E:** `admin-sports.spec.ts` +1 test (the hint, the server's refusal of `maxRecords: 0`, a save, and a reload that reads it back); the file passed (7 tests) together with `session-results.spec.ts`. Full e2e not run. `E2E_OVERVIEW.md` updated.
- **Visual-regression expectation:** no baselined surface touched (no admin screen has a baseline); no baseline change expected. Not run.
- **Not verified:** against the real backend (the endpoints exist from SESSION-50 but `V089` is not applied on the dev database), and no vi copy (by convention).
- **Follow-up, not filed:** a structured form for the record schema (the contract in `documentation/md/RECORD_SCHEMA_CONTRACT.md` is stable enough) is the V1 sibling of ADMIN-3; the JSON editor is the same trade-off the two attribute schemas made.
