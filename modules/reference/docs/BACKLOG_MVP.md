# Reference Module — Feature Backlog

**Version:** MVP v1
**Module:** `modules/reference` (`reference-api` / `reference-impl` — not yet created; REF-1 creates it)
**Last updated:** 2026-09-25 (backlog created; REF-1, REF-2, REF-3 filed)

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session
- Mark it `DONE` when implementation + tests are complete, and move its row down into **Done**
- Use `/workon reference MVP` to resume

The domain owns the **Language / Country / Region** reference data (three tables), the public read endpoints,
and the coordinate/timezone/locale resolver. Full design, decision record and every declined alternative:
`documentation/md/REFERENCE_DATA_DESIGN.md`.

## Tickets in other backlogs that belong to the same feature

They are filed in the module whose code they change (so `/workon <module>` and `/list <module>` see them), and
each names its REF prerequisite:

| Ticket | Backlog | What | Needs |
|---|---|---|---|
| U16 | `modules/user/user-impl/docs/BACKLOG_MVP.md` | User country/region/language links: profile, preferences, register details | REF-1 (and REF-2 for `resolve`) |
| LOC-5 | `modules/location/docs/BACKLOG_MVP.md` | Venue country/region links + backfill runner | REF-2 |
| A24 | `modules/sport/sport-impl/docs/BACKLOG_MVP.md` | Attribute-label locale prefers the stored language (I18N-3) | U16 |
| CLIENT-I18N-1, CLIENT-REF-1..3, CLIENT-I18N-2 | `client/docs/BACKLOG_MVP.md` | i18n infra, reference hooks + `GeoLocaleFields`, sign-up and profile integration, rest-of-app translation | see each ticket |

---

## Open (TODO / IN PROGRESS)

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [REF-1](MVP/REF-1_REFERENCE_MODULE_TABLES_SEEDS_AND_PUBLIC_READS.md) | New `reference` module — `languages`/`countries`/`regions` tables, seeds (all countries, Vietnam regions, `en`+`vi`), public read endpoints, security config | `TODO` |
| 2 | [REF-2](MVP/REF-2_BOUNDARY_RESOLVER_AND_RESOLVE_ENDPOINT.md) | Offline boundary resolver (JTS) + public `POST /api/reference/resolve` (coordinates > timezone > locale) | `TODO` |
| 3 | [REF-3](MVP/REF-3_VIETNAM_PROVINCE_DATA_REFRESH.md) | Refresh Vietnam's regions and boundaries to the current province list (63 → 34 merger) | `TODO` |

---

## Done

| # | Ticket | Title | Status |
|---|---|---|---|
| — | — | _(none yet)_ | — |
