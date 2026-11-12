# SPORT-17 · A schema default seeded by SportAttributesFields reads as a user edit in the profile editor and the session detail edit section

**Status:** `TODO`
**Type:** Bug Fix · **Depends on:** none (the create-session form was fixed in CLIENT-SESSION-34, `aa6e23d`) ·
**Filed:** 2026-11-12, found in CLIENT-SESSION-34's CI failure: the same defect there came from the shared `SportAttributesFields`, which every host of the attribute form uses.

## What is wrong

`SportAttributesFields` copies each visible node's schema `defaultValue` into the host's values with `onChange`, once, when the schema loads (`useEffect` on `[schema]`). A host that decides "dirty" or "can save" by comparing the values with what it started from then sees a change nobody made. Attributes are the way each sport is customised across the app, so every host is exposed to the first default that ships.

Two hosts, from reading the code (neither reproduced, no schema in the repo has a default yet apart from the e2e mock's `match/format`):

- **Profile editor**: `isSportProfileDraftDirty` (`features/profile/sportProfileEditDraft.ts`) compares `draft.attributes` with the saved ones. A seeded default would enable Save on an untouched tab and make `useUnsavedChangesGuard` ask before leaving or switching sport.
- **Session detail edit section**: `DetailSection.canSave` (`SessionDetailSections.tsx`) compares the schema-trimmed values with the stored ones, so Save would light up in an untouched section whose stored map lacks that path. The summary read view is not affected.

The create-session form is already fixed: `hasEditedAttributeValues(schema, values)` (`attributeFields/defaults.ts`, built on `collectDefaultValues`, which lists what the schema seeds) counts a value only if it differs from its default or has none; the two hosts above can call it. The rule is also written in `client/CLAUDE.md` (Component conventions).

## Fix direction (decide at pickup)

Either each host compares against the defaults (reuse `collectDefaultValues`, as the create form does), or seeding moves so the starting point already contains the defaults (the host's "original" is the stored map plus the defaults, and the comparison stays as it is). The second fixes every host at once and any future one; check that it does not change what a PATCH sends for a profile that never had the attribute. First step: reproduce both with a Vitest case using a schema that carries a `defaultValue`.

**Out of scope:** adding a real default to any seeded sport schema; the create-session form (done).

**Tests:** a failing Vitest case per host first (profile tab: Save disabled and no leave prompt on an untouched tab; detail section: Save disabled on an untouched section), mutation-checked; the shared seeding contract in `SportAttributesFields.test.tsx`.
