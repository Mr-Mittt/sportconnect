# CLIENT-I18N-7 · Translate Groups page

**Status:** `DONE` (2026-09-29)
**Type:** Enhancement
**Depends on:** CLIENT-I18N-2, CLIENT-I18N-3, CLIENT-I18N-4 (Home Feed), CLIENT-I18N-5 (enums)
**Filed:** 2026-09-29, split out of `CLIENT-I18N-6` at pickup (narrowed to Profile only — user decision).

## What

Translate the Groups feature (`features/groups/`, 16 components). Same per-feature checklist as every prior i18n ticket: new namespace + `i18n.ts`
and `.storybook/preview.ts` registration + `src/app/i18n.test.ts` key-parity coverage + `useOverridableText`
`i18nOverridePrefix` on components + regenerated visual baselines (`update-baselines`, never from Windows)
+ `Intl` + active-locale for any hardcoded date/number/currency. Check `sharedComponents` before adding a
duplicate key. Read `documentation/md/I18N_READINESS.md` I18N-10 before starting: check each form for native
constraint validation and for a verbatim server message (add a row to I18N-4's census if so).
Its Invite Friend modal (`useInviteFriendModalData`) shows a raw server message — re-check that census row.

**Out of scope:** shared chrome (CLIENT-I18N-3), mirrored backend enums (CLIENT-I18N-5), backend message
localization (I18N-4), the language picker, Admin pages (no localization needed — user decision 2026-09-29).

## Added scope (2026-09-29, filed from CLIENT-I18N-6's close-out — user decision): `AddSportFields`

`shared/components/AddSportFields.tsx` (the Add Sport modal's form body, used from `/profile`, Groups and
elsewhere) is entirely untranslated and belongs to this ticket. Found while translating
`SportProfileSettingsTab` in CLIENT-I18N-6, which translated the skill-level labels locally
(`profilePage:settings.skillLevels.*`) rather than touching `shared/lib/skillLevels.ts`, since that lib is
shared with `AddSportFields`.

- Strings: "Sport", "Skill level" + "Select a skill level" placeholder + the `SKILL_LEVELS` option labels
  (Beginner/Intermediate/Advanced), "Years of experience (optional)", the "You already have a profile for every
  sport…" message, the "You had a {sport} profile before — …" resume note, "Couldn't add that sport. Try
  again.", Cancel, and the Add sport / submitting button text.
- Pick a namespace/home in `sharedComponents` (or a sibling) since it renders from more than one page, with
  `i18nOverridePrefix` per the shared-component convention. Reuse or align with `profilePage:settings.skillLevels.*`
  rather than duplicating the three level labels with different wording — consider moving them into a shared
  key and pointing both at it.
- Check `AddSportModal` and any sibling shared add-sport pieces (`AddSportIntroDialog` is already in
  `sharedDialogs`) for further untranslated copy while there.
- I18N-10: check whether this form shows native validation or a verbatim server message (`Couldn't add that
  sport` looks client-authored); add an I18N-4 census row if it surfaces a server message.

## Scope check at pickup (2026-09-29)

User confirmed nothing to add or remove. Two defaults confirmed by not objecting: shared skill-level keys in
`sharedComponents` (rather than another local copy), and `AddSportFields`/`AddSportModal` copy in
`sharedComponents` too.

## Implementation summary (2026-09-29)

**Approved design (restated):** new `groups` namespace (`locales/{en,vi}/groups.json`) registered in
`app/i18n.ts`, `.storybook/preview.ts` and `app/i18n.test.ts` parity; the 16 components in `features/groups/components/`
use `useOverridableText('groups', i18nOverridePrefix)`; `GroupsPage` (a page, no override need) uses plain
`useTranslation('groups')` for its sr-only `<h1>`; plain hooks read the i18next singleton. `AddSportFields` +
`AddSportModal` + the skill-level labels go in `sharedComponents` (`addSport.*`, `skillLevels.*`); `SKILL_LEVELS` becomes a
values-only tuple and `SportProfileSettingsTab` is repointed at the shared labels (its I18N-6 `profilePage:settings.skillLevels.*`
keys removed). English values are byte-identical to the literals they replace.

**Built:** exactly the above. Internal helper components in a file (`MemberRow`/`Section` in `GroupMembersTab`,
`ToggleFieldRow`/`TextFieldRow` in `GroupSettingsTab`, `ResultSection` in `JoinGroupModal`) receive the resolved `t` as a
prop so the override prefix reaches them; `GroupTabs`' `TABS` constant lost its `label` field (label is now
`t(\`tabs.${key}\`)`).

**Divergences / additions found by the audit (all consumer-censused):**
- `formatNameList` (only consumers: `GroupInvitationsSection`, `GroupMembersTab`) hardcoded English "and" — now
  `Intl.ListFormat(i18next.language)`; English output is unchanged (Oxford comma), Vietnamese is "A, B và C".
- `formatTypingLabel` (`features/chat/typingLabel.ts`) is shared by the group chat view **and** `FriendChatPanelView`.
  Translated via `common:typing.*` — **updated in this change** for both callers; CLIENT-I18N-8 (Friends) inherits it.
  Its English output is unchanged; the Friends chat panel gains Vietnamese without a Friends-side edit.
- `PAGE_ACCESS_NO_SPORTS_PROMPT` (a string constant in `shared/lib/noSportsPrompt.ts`) became
  `getPageAccessNoSportsPrompt()`, since a constant captured at module load can't follow the locale. Consumers:
  `GroupsPage` (in scope), `ProfilePage`, `MatchesPage` — each a one-line call-site change, **updated in this change**
  (no other reference in `src/` or `e2e/`). The *action-specific* prompts inside `CreateSessionModal`/`SessionDiscoverModal`
  are untouched — CLIENT-I18N-10.
- **Deliberately still English:** `groupSettings.groupTypeName` (server-authored data rendered as-is — same class as
  server-resolved labels, not client copy) and sport names (`getSportProfileConfig().label` → CLIENT-I18N-11, already filed).
  Server error messages shown verbatim stay English (I18N-4).
- No hardcoded date/number/currency formatting exists in these files (member counts use `{{count}}`; Vietnamese has no
  plural forms so no `_other` variants were needed).

**I18N-10 form checks:** none of the forms (Create Group, Join Group, Group Settings, Invite Friend, Reject/Delete
dialogs, Add Sport) use native constraint validation — they are not `<form>` elements and submit from `onClick`
handlers, so no browser-language validation bubble can appear. The only verbatim server message is **Invite Friend**
(`useInviteFriendModalData`'s `extractErrorMessage`): its existing I18N-4 census row is still accurate; only its
client-authored fallback ("Something went wrong…") is translated here. `AddSportFields` shows only a client-authored
generic error via `isError` (no server text) → no census row.

**Tests:** new Vietnamese-render and override-prefix tests for `GroupTabs`, `CreateGroupModal`, `AddSportModal`
(including the shared skill-level label), `formatNameList`, and a new `typingLabel.test.ts`; `groups` added to the
`i18n.test.ts` key-parity table; one new e2e (`locale.spec.ts`, Groups page in `vi`).

**E2E:** scoped `e2e` project — `locale`, `group-chat`, `group-invitations`, `group-members`, `group-settings`,
`feed-groups-journey`, `a11y`, `profile-journey`, `matches-journey`, `direct-chat`, `friends-journey`: **61 passed**. One
locator bug in my own new test (`getByLabel('Tên nhóm')` substring-matched the discovery search's "Tên nhóm hoặc mã mời"
aria-label — the Playwright-vs-RTL default the workflow warns about) fixed by scoping to the dialog with `{ exact: true }`.
Full `e2e` project not run (scoped subset only, by standing rule).

**Visual-regression expectation:** no baselined surface touched by design — English output is byte-identical, so no baseline
change is expected; a failing `visual-regression` run is the Windows noise floor. Checked: `app-groups.spec.ts` fails
18/18 with the change and 18/18 with it stashed; first-attempt pixel counts are identical between the two runs (the one
retry that differed — `members-tab @ 768px`, page height 1114 vs 1011 — is a loading-timing flake: re-run in isolation twice
with the change, both 21758 px, equal to the stashed run). Not separately re-run: `app-profile`, `app-friends`,
`app-matches` (they render `getPageAccessNoSportsPrompt()`/typing text only in states not baselined).

**Delta for the next tickets:** CLIENT-I18N-8 (Friends): `formatTypingLabel` is already translated — don't redo it.
CLIENT-I18N-10 (Sessions/Matches): `CreateSessionModal`/`SessionDiscoverModal`'s local `NO_SPORTS_PROMPT` constants can
follow the `getPageAccessNoSportsPrompt()` pattern; `AddSportFields` is already translated and takes `i18nOverridePrefix`.
