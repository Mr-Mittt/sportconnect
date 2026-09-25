# A24 · Attribute-label locale prefers the user's stored language over `Accept-Language`

**Status:** `TODO`
**Type:** Enhancement (behaviour of an existing GET)
**Depends on:** U16 (language becomes a validated, meaningful value on `UserPreference`); client CLIENT-I18N-1 ships
first so the header already follows the in-app locale
**Filed:** 2026-09-25, from the `/feature` session "Language, country and zone" — `documentation/md/I18N_READINESS.md`
**I18N-3**. A13's design (§ 7.5) deliberately deferred a per-user locale override; the feature above builds the stored
language, so the resolver should consult it rather than leave two sources of truth for "which language is this user in".

## What

The endpoints that resolve localized attribute labels — `GET /api/sports/{sportId}/attribute-schema` and
`GET /api/sports/{sportId}/session-attribute-schema` — resolve a `Locale` from `Accept-Language` today
(`SportController`, via `AttributeSchemaResolver.resolve(schema, locale)` in `common`). For an **authenticated caller
with a stored language**, use that instead; otherwise fall back to `Accept-Language` exactly as now.

Sketch (decide the placement at pickup): a small resolver in `sport-impl` that takes the caller id + request `Locale`,
asks `UserPreferenceService` (`user-api`) for the stored language code, and returns `Locale.forLanguageTag(code)` when
present and active. Prefer a **single cheap lookup per request**, not one per node. Keep `AttributeSchemaResolver`
(common, static, pure) unchanged — the change belongs at the controller edge, as A13 intended.

## Edge cases

- Anonymous caller or no preference row → `Accept-Language` (unchanged). `UserPreferenceService.get…` auto-creates
  defaults on first read (`language = "en"`), so decide whether an *auto-created default* should override
  `Accept-Language` — it must **not**; only an explicitly stored language should. Look at how U3 creates the row and
  surface this in the pickup Phase 1.
- Stored code no longer active → fall back to `Accept-Language`.
- Account lifecycle: both endpoints are `@PreAuthorize("isAuthenticated()")`; a deactivated caller can still hold a valid
  access token (U12). This ticket adds no new write and no new data exposure, so no extra `isActive` check is needed —
  confirm at pickup.
- Cross-domain: `sport-impl` → `user-api` may already exist; check before adding a dependency, and never import
  `user-impl`.

## Consumer census

REST shape unchanged; the only visible difference is *which* language the labels come back in for a user whose stored
language differs from their browser's. Consumers: client `useSportAttributeSchema` / `useSessionAttributeSchema`
(query keys already include the locale after CLIENT-I18N-1), `SportAttributeSchemaIntegrationTest` /
`SessionAttributeSchemaIntegrationTest` (extend).

## Tests

- Spock for the resolver (stored language wins; anonymous falls back; inactive/unknown stored code falls back).
- **IT** extending `SportAttributeSchemaIntegrationTest`: a user with stored `vi` and `Accept-Language: en` gets the
  Vietnamese labels through the real request pipeline; a user with only the auto-created default does not override the header.

**Out of scope:** translating any other backend-authored string (I18N-4/5); changing `AttributeSchemaResolver`; the client.
