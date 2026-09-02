# CLIENT-SESSION-15 · Session attributes in CreateSessionModal, pre-filled from the user's profile

**Status:** `TODO` · **Type:** Enhancement · **Depends on:** CLIENT-SESSION-14; ideally SPORT-7
(group layout) lands first
**Filed:** 2026-09-02.

## What ships

In `CreateSessionModal`, once the sport is chosen:
- `useSessionAttributeSchema(sportId)`; render its groups via the existing `SportAttributesFields`
  (verify it needs no change — the resolved session schema is the same shape).
- **Pre-fill**: for each resolved node flagged `prefillable`, seed the draft from the user's
  profile-for-that-sport (`useMySportProfilesRaw`) at `profile.attributes[prefillKey]`, only when
  present and type-compatible. Own (non-prefillable) nodes seed from `defaultValue` only, same as
  the profile editor.
- No profile for that sport -> fields start empty, no error. No session schema -> section hidden.
- Include `attributes` in the create payload.

The modal's existing unsaved-changes guard already covers the new fields.

## Out of scope

Read-only display (CLIENT-SESSION-16). Editing attributes on an existing session's detail view
(SESSION-23 exposes the endpoint; a client edit surface is a later ticket if wanted).

## Tests

Vitest: pre-fills a `#ref` field from profile data; leaves an own field on its `defaultValue`;
no-profile and no-schema paths; `attributes` reaches the payload. Story for pre-filled / empty /
no-schema states.
