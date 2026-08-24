# i18n Readiness

A running list of considerations for **app-wide i18n** (static UI copy, a locale switcher,
`User.preferredLocale`) — collected here so they don't stay buried in whichever ticket first raised
them. **No app-wide i18n is built, or even designed, anywhere in this codebase yet.** There is no
i18n library in `client/package.json`, and the only trace of the idea is one unanswered question in
`documentation/md/ARCHITECTURE_PROPOSAL.md` ("Multi-language Support: Do you need
internationalization?"). This file exists so that when it's finally scoped, there's already a real
list of concrete interactions and gotchas to design against instead of starting from a blank page —
same purpose as `documentation/md/NOTIFICATION_USE_CASES.md` for the notification feature.

**Do not confuse this with the attribute-schema localization already built (A13).** That one is a
narrower, already-shipped mechanism — see [Relationship to A13](#relationship-to-a13-attribute-schema-localization)
below for exactly how the two interact and where they must not diverge.

## How to use this file

- Log a new consideration whenever an i18n-relevant gotcha, interaction, or open question comes up
  anywhere — a ticket, a `/vision` session, a bug write-up — and isn't resolved on the spot. Don't
  leave it as a loose bullet in that doc; add it here too, with a pointer back to the source.
- Entries are numbered `I18N-<n>`, sequential, never reused even if a consideration turns out moot.
- Status values: `CANDIDATE` (logged, not yet decided) · `CONFIRMED` (product/design decision made,
  still not built) · `BUILT` (shipped, link the ticket) · `MOOT` (considered and no longer applies —
  say why).
- When app-wide i18n is eventually scoped, this file is the starting input — every open entry
  becomes a concrete constraint the design has to satisfy, not a fresh brainstorm.

---

## Relationship to A13 (attribute-schema localization)

`modules/sport/sport-impl` already ships locale-aware content — per-sport attribute labels
(`SportAttributeSchema.label`, A13) — but via a mechanism that will *not* generalize to static UI
strings without deliberate work:

- **Resolved server-side, not bundled client-side.** The server reads `Accept-Language` and returns
  one string per node; the client never receives the full set of translations for a label the way a
  static i18n bundle ships every locale up front. This is the right call for A13 specifically —
  labels are admin-authored, dynamic content the client can't know about ahead of a fetch — but it
  is the *opposite* of how most static-string i18n libraries work (they bundle every locale
  client-side and switch instantly, no network round trip).
- **Locale codes are BCP 47** (`en`, `vi`, `en-US`, `vi-VN`), deliberately not the ISO 3166 country
  code (`vn`) mistake. Whatever app-wide i18n solution is picked must use the same code system —
  two different locale-code schemes living side by side in the same app would be its own bug class.
- **No `User.preferredLocale` field exists.** A13's design doc (§7.5) named this as a future
  override for `Accept-Language`-based resolution but deliberately did not build it, since nothing
  needed it yet. App-wide i18n's locale switcher is the natural moment this actually gets built — and
  once it exists, A13's resolver should almost certainly be extended to consult it too, not just
  `Accept-Language`, so a signed-in user's chosen language is consistent between the UI chrome and
  the attribute labels next to it.

## Considerations

### I18N-1 · No app-wide i18n exists — this file's own reason to exist
**Date added:** 2026-08-24
**Status:** `CANDIDATE`
**Source:** `documentation/md/ARCHITECTURE_PROPOSAL.md`'s unanswered "Multi-language Support" question, surfaced while scoping A13

Nothing is built or designed. Whoever picks this up first needs to answer, at minimum: which
library (see I18N-8), where translation bundles live, how the locale is detected/selected, and
whether it's a v1-MVP requirement or a later phase.

### I18N-2 · The UI's chosen locale must drive `Accept-Language` on attribute-schema requests
**Date added:** 2026-08-24
**Status:** `CANDIDATE`
**Source:** A13 (`modules/sport/sport-impl/docs/MVP/A13_LOCALIZED_ATTRIBUTE_SCHEMA_LABELS.md`)

Whatever mechanism app-wide i18n uses to pick the in-app language (URL locale prefix, cookie,
explicit switcher backed by local state) is *not* automatically what the browser sends as
`Accept-Language` — that header reflects OS/browser settings by default. If the two diverge (a user
picks Vietnamese in-app on an English-configured browser), the sport-attribute labels client `SPORT-2`
renders would silently resolve to the wrong language unless the client explicitly overrides the
`Accept-Language` header on that request to match the in-app selection. (`Accept-Language` is not on
the Fetch spec's forbidden-header list, so this is possible — worth a quick live confirmation at
implementation time rather than taken purely on faith here.) If a query library like TanStack Query
is used for that fetch (per `client/CLAUDE.md`), the query key must include the active locale, or
switching languages won't trigger a refetch and will keep serving the previous language's cached
response.

### I18N-3 · `User.preferredLocale` doesn't exist yet — building it here should also wire it into A13
**Date added:** 2026-08-24
**Status:** `CANDIDATE`
**Source:** A13 design doc §7.5

A13 explicitly deferred a persisted per-user locale preference. If app-wide i18n adds a locale
switcher with server-persisted state (so the choice survives across devices/sessions, not just
`localStorage`), that's the same field A13 already anticipated. Whoever builds it should update
`SportAttributeSchemaLabelResolver` to prefer `User.preferredLocale` over `Accept-Language` when the
caller is authenticated and has one set, rather than treating the two as unrelated.

### I18N-4 · Backend-authored, user-facing strings are English-only today
**Date added:** 2026-08-24
**Status:** `CANDIDATE`
**Source:** surfaced while scoping A13's resolution split (raw vs. resolved responses)

`ApiResponse.message` and every domain exception's message (`BadRequestException`,
`ForbiddenException`, etc.) are hardcoded English strings, returned directly over the wire and, in
several places, rendered close to as-is by the client. Once the UI is localized, an English error
toast next to a translated form is a visible seam. Two directions to choose between when this is
scoped, not decided here:
1. The client stops displaying `message` directly for known error cases and maps a stable error
   *code* to its own translated copy instead (the backend would need to start returning codes, not
   just prose, for at least the cases the client wants to localize).
2. The backend grows a message catalog and does `Accept-Language`-based resolution for its own
   error/validation messages — a generalized version of what A13 built specifically for schema
   labels, at a much larger surface area (every `throw new BadRequestException(...)` site in the
   app today).

### I18N-5 · Client-mirrored backend enums are also translatable surface
**Date added:** 2026-08-24
**Status:** `CANDIDATE`
**Source:** the `/workon` skill's "client-visible enum or event type check" — the client hand-mirrors
~15 backend enums into display text (e.g. `getNotificationText`, post/comment type rendering)

These display strings (notification text, post/comment type labels, session status labels, etc.)
are currently hardcoded English in the client, generated from backend enum values. They're a
meaningful chunk of the eventual translation-bundle surface, distinct from generic static UI copy
(buttons, nav labels) — worth accounting for in scope/sizing when i18n is estimated, not discovered
partway through.

### I18N-6 · Library choice is constrained by the actual client stack
**Date added:** 2026-08-24
**Status:** `CANDIDATE`
**Source:** `client/CLAUDE.md` (Vite + React 18 + TS, not Next.js)

Some popular React i18n solutions (e.g. `next-intl`) are Next.js-specific and don't fit this stack.
A Vite-compatible option (e.g. `react-i18next`, FormatJS/`react-intl`) is the natural fit — not a
final decision, just a constraint to check against whatever gets proposed, per `client/CLAUDE.md`'s
"no second styling system / test runner / icon set" spirit applied to i18n libraries too.
