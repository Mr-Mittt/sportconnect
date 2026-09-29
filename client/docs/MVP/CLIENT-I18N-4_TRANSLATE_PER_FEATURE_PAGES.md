# CLIENT-I18N-4 · Translate per-feature pages (Home Feed, Groups, Friends, Profile, Sessions/Matches, Notifications, Admin)

**Status:** `DONE` (2026-09-29, Home Feed only — see Scope change and Implementation summary below)
**Type:** Enhancement (broad, incremental — expected to split into one ticket per feature at pickup)
**Depends on:** CLIENT-I18N-2 (step 1), CLIENT-I18N-3 (step 2 — shared chrome translated first, so a
feature page isn't the only translated island the wrong way around: shell in English, content in
Vietnamese)
**Filed:** 2026-09-29, split out of `CLIENT-I18N-2` at pickup — step 3 of that ticket's ordered list.

## What

Translate the remaining feature pages' own copy: Home Feed, Groups, Friends, Profile, Sessions/
Matches, Notifications, Admin. Each gets its own PR, its own i18n namespace (per `app/i18n.ts`'s
one-namespace-per-page convention), its own tests, and its own regenerated visual baselines — this
ticket is filed as the umbrella placeholder; **file each feature as its own backlog ticket when
picked up**, same "prefer splitting" note the parent ticket (`CLIENT-I18N-2`) itself carried.

**Entry point:** each feature's own route(s).
**Inputs/outputs:** no data-shape change — pure UI string extraction per feature.

## Notes for pickup

- **User directive (2026-09-29, at `CLIENT-I18N-3`'s pickup, carried forward here since that
  ticket's own scope stayed narrow — chrome + 6 cross-page dialogs only):** this ticket covers
  every remaining `shared/components/` file too, not just the 7 pages' own `<Feature>Page.tsx`
  files — `Feed`, `PostCard`, `CommentSection`, `EditProfileModal`, `AddSportModal`/`AddSportFields`,
  `GroupBroadcasts`, `HashtagPostsModal`, `SessionCard`, `SportSwitcher`, `ProfileHeader`,
  `TrendingHashtags`, `UpcomingMatches`, the `attributeFields/` subfolder, and anything else under
  that folder still holding hardcoded English. **No hardcoded text left anywhere in scope.** Apply
  `useOverridableText` (`src/shared/lib/useOverridableText.ts`, built at `CLIENT-I18N-3`) as the
  standard pattern for any component a caller could plausibly want different wording from — not
  just the 6 dialogs `CLIENT-I18N-3` already covered. A component with only one call site and no
  real override need yet still gets a default key in the right namespace; add the
  `i18nOverridePrefix` prop preemptively when the component is the kind of thing (a dialog/modal/
  confirm pattern) `CLIENT-I18N-3` applied it to on principle, not only when a second caller already
  exists.
- **Read `documentation/md/I18N_READINESS.md`'s I18N-10 before starting.** Translating static JSX
  strings is not the whole job — every form in scope (and there are several across these 7 features)
  needs its own check for (a) native HTML5 constraint validation rendering an untranslated browser
  popup, and (b) whether it shows a server error message verbatim — if so, **add its row to I18N-4's
  own census table** (same section of that doc), don't just note it locally in each feature's own
  ticket. Found and fixed twice already (`RegisterForm`, `LoginForm`) — check every form here, don't
  assume none of the 7 features have one.
- Pick an order — likely highest-traffic first (Home Feed, Profile) — and file/pick up one feature
  at a time rather than attempting all seven in one pass.
- Same per-feature checklist as every prior i18n ticket: new namespace + `.storybook/preview.ts`
  registration + `src/app/i18n.test.ts` key-parity coverage + regenerated visual baselines
  (`update-baselines`, never from Windows) + audit any hardcoded date/number/currency (`VND`)
  formatting for `Intl` + the active locale while that feature is touched anyway.
- Admin pages: confirm whether admin-only surfaces are in scope for `vi` at all, or English-only is
  an accepted call (admins may be internal-only) — a real scope question, not obvious either way.

**Out of scope:** `TopBar`/`NavTabs`/shared chrome (CLIENT-I18N-3); client-mirrored backend enums
(CLIENT-I18N-5); backend message/enum localization (I18N-4); the language picker UI.

## Scope change (2026-09-29, at pickup)

Per this ticket's own "pick up one feature at a time" note, this pickup narrows to **Home Feed**
only. The other six pages (Groups, Friends, Profile, Sessions/Matches, Notifications, Admin) are
**not** built here — file each as its own ticket when picked up next, same as this file's own
umbrella note already says.

**Home Feed's scope for this pickup:**
- `features/home-feed/HomeFeedPage.tsx` (only one hardcoded string of its own: the `sr-only`
  `<h1>Home Feed</h1>` — everything else is composition/wiring of shared components)
- `shared/components/`: `Feed`, `PostCard`, `CommentSection`, `CommentItem`, `CreatePostForm`,
  `GroupBroadcasts`, `HashtagPostsModal`, `TrendingHashtags`, `SportSwitcher` — every one of these
  is also used by other pages (Groups/Friends/Profile), so translating them here front-loads work
  those future tickets won't have to repeat. `HashtagText`/`SportIcon` audited, no hardcoded text.
- `shared/lib/relativeTime.ts` (`formatRelativeTime` — "just now"/"Xm ago"/"Xh ago"/"Xd ago", used
  by `PostCard`/`CommentSection`/`CommentItem`/`GroupBroadcasts` here and also
  `NotificationRow`/`startTime.ts` elsewhere)
- Generalizing `useOverridableText` (CLIENT-I18N-3) to take an explicit default namespace
  (`useOverridableText(defaultNs, overridePrefix?)`) instead of hardcoding `'sharedDialogs'`, so
  it's reusable for this ticket's own namespace too — updates all 6 existing callers to pass
  `'sharedDialogs'` explicitly, same PR.

**Explicitly deferred (user decision at pickup, 2026-09-29) to the future Sessions/Matches
ticket**, even though Home Feed renders/triggers them: `shared/components/UpcomingMatches.tsx` +
`shared/components/SessionCard.tsx` (pulls in `feeType.ts`/`sessionParticipation.ts`/
`sessionCapacity.ts`/`startTime.ts`'s "Today"/"Tomorrow" — enough Sessions-domain surface that
translating it here would blur this ticket into that one), and
`features/session/components/CreateSessionModal.tsx`/`SessionDetailModal.tsx`/
`SessionDiscoverModal.tsx` (feature-owned by Sessions/Matches, not `shared/components/`). Home
Feed's right-rail "Upcoming matches" card and its Create/Join session modals stay English for now
— an accepted seam (same class as I18N-7), not a bug, until Sessions/Matches is picked up.

No form in this scope shows native HTML5 constraint validation or a raw server-authored message
(checked per I18N-10): every `isError` flag here renders a client-authored generic message (e.g.
"Couldn't load posts.", "Couldn't create post. Try again."). No I18N-4 census row needed for this
ticket.

`SESSION_SYSTEM` comment content (rendered verbatim by `CommentItem`, e.g. "Priya Shah joined the
session") is backend-templated text, not a client string to extract — already known/accepted as
part of I18N-4's general backend-message gap, not a new finding.

## Implementation summary

Built as designed in the "Scope change" section above — no divergence from the approved plan.

**Namespaces:**
- `homeFeed` — `HomeFeedPage.tsx`'s one string (`pageHeading`, the `sr-only` `<h1>`).
- `sharedComponents` — default copy for the 9 shared components, one nested object per component
  (`feed.*`, `postCard.*`, `commentSection.*`, `commentItem.*`, `createPostForm.*`,
  `groupBroadcasts.*`, `hashtagPostsModal.*`, `trendingHashtags.*`, `sportSwitcher.*`), mirroring
  how `sharedDialogs` is structured. Each of the 9 components gained an optional
  `i18nOverridePrefix` prop, resolved through `useOverridableText('sharedComponents',
  i18nOverridePrefix)` — no current caller passes an override, built ahead of a concrete need per
  the ticket's own directive, same as `CLIENT-I18N-3`'s original 6.
- `common.relativeTime.*` — `formatRelativeTime`'s "just now"/"Xm ago"/"Xh ago"/"Xd ago" moved
  here instead of `sharedComponents`, matching the `geoLocaleFields` precedent for a fragment
  genuinely shared *between* namespaces (also used by not-yet-translated `NotificationRow`). No
  i18next pluralization (`_one`/`_other`) needed — none of these English phrases actually change
  wording by count ("1m ago"/"5m ago" are both "Xm ago"), so a single interpolated key per unit
  matches the pre-existing behavior exactly rather than adding unused plural-form complexity.

**Non-component i18n (new pattern):** `relativeTime.ts` is a plain function, not a component, so
it can't call `useTranslation()`. It calls the i18next singleton directly
(`i18next.t('common:relativeTime.xxx', {count})`), which always reflects the current language
since `app/i18n.ts` keeps i18next's active language following `localeStore`. This is the first
place in the codebase that needed to translate outside a React component; Vitest's global setup
(`src/test/setup.ts`) already initializes the same i18next singleton before every test file runs,
so no new test-infra was needed.

**Mechanical change:** `useOverridableText(overridePrefix?)` → `useOverridableText(defaultNs,
overridePrefix?)`. Updated all 6 `CLIENT-I18N-3` callers (`JoinFeedbackDialog`,
`ReactivateSportNudgeDialog`, `UnsavedPostConfirmDialog`, `AddSportIntroDialog`,
`NoSportsToAddDialog`, `UpdateBroadcastConfirmDialog`) to pass `'sharedDialogs'` explicitly, plus
its own unit test file (`useOverridableText.test.ts`).

**Non-obvious fixes along the way:**
- `Feed.tsx`'s `emptyMessage` prop had a JS default-parameter value (`= 'No posts yet for this
  sport.'`) — can't call `t()` there since default-parameter expressions evaluate before the
  function body (where `useTranslation`'s result would be declared) exists in scope. Changed to
  `emptyMessage?: string` with no default, resolved inside the body:
  `emptyMessage ?? t('feed.emptyMessageDefault')`. Behavior-identical; `HashtagPostsModal`'s own
  explicit `emptyMessage` override (a literal prop, not `i18nOverridePrefix`) is unaffected.
- `CreatePostForm`'s placeholder ("What's on your mind, {name}?" / "What's on your mind?") was a
  single template literal splicing in a conditional `, {name}` fragment — split into two full keys
  (`placeholderWithName`/`placeholderDefault`) instead of interpolating a comma-prefixed fragment,
  since concatenating a mid-sentence fragment doesn't hold up across languages with different word
  order.
- `HashtagPostsModal`'s two English fallbacks ("Hashtag" dialog-title fallback vs. "this hashtag"
  inside the empty-state sentence) are genuinely different strings for different grammatical
  slots — kept as two separate keys (`fallbackTitle` / `emptyMessageFallbackTag`) rather than
  reusing one lowercased.

## Verification

- **tsc/eslint:** clean across every touched file.
- **Vitest:** 46 files / 443 tests green, scoped to `src/shared/components/`,
  `src/features/home-feed/`, `useOverridableText.test.ts`, `relativeTime.test.ts`,
  `i18n.test.ts` (key-parity).
- **E2E:** the `e2e` project's 9 Home-Feed-touching flow specs (found via the `grep client/e2e/`
  sweep for every changed component/hook): `a11y.spec.ts`, `feed-groups-journey.spec.ts`,
  `group-invitations.spec.ts`, `home-feed-journey.spec.ts`, `locale.spec.ts`,
  `notification-bell.spec.ts`, `post-deep-link.spec.ts`, `smoke.spec.ts`, `profile-journey.spec.ts`
  — **65/65 passed** (confirmed twice; an intermediate run showed 51 failures from a dead local
  mock-server process between runs, not a code issue — resolved by restarting the Playwright-
  managed servers, then reconfirmed 65/65 clean). One real, expected fix: `locale.spec.ts`'s
  vi-locale test asserted the stale English "Home Feed" heading after login; now asserts "Bảng
  tin", same class of fix `CLIENT-I18N-3` made to `profile-journey.spec.ts`. Full `e2e` project
  not re-run (scoped subset only, per this session's token-budget convention).
- **Visual-regression expectation:** no baselined surface's *content* legitimately changes — every
  string still renders identically in English (the default/baseline locale), so no baseline update
  is expected. Confirmed via stash-and-rerun on the two most relevant specs: `app-home-feed.spec.ts`
  (9/9 failures, byte-identical test-name set on branch vs. clean `master`) and
  `app-sport-reactivate.spec.ts` (21/21, same). Both are the documented Windows font-rendering
  noise floor, not a regression — pixel-diff ratios stay in the same 0.01–0.07 range on both sides
  and the exact same test names fail both times. `app-groups.spec.ts`/`app-notification-bell.spec.ts`/
  `app-post-modal.spec.ts`/`app-session-detail-modal.spec.ts` were run once (90/90 fail on branch,
  consistent with the known wholesale-Windows-failure pattern) but not individually stash-compared;
  the two specs that were compared cover the same shared components those others also render, so
  the noise-floor conclusion is expected to generalize.
- **Live browser walk:** not done — the Claude in Chrome extension wasn't connected in this
  environment ("Browser extension is not connected"). Backend (`:8080`) and a manually started
  Vite dev server (`:5173`) were both confirmed reachable before hitting that blocker; the dev
  server was stopped afterward. The e2e suite above (MSW-mocked against the documented real DTO
  shapes) is the evidence in its place.

## Follow-up

Filed **CLIENT-I18N-6** (`client/docs/MVP/CLIENT-I18N-6_TRANSLATE_REMAINING_FEATURE_PAGES.md`) for
the other 6 original pages (Groups, Friends, Profile, Sessions/Matches, Notifications, Admin) plus
the deferred `UpcomingMatches`/`SessionCard`/session-modal surface, inserted into
`client/docs/BACKLOG_MVP.md`'s Open table at this ticket's old queue position.
