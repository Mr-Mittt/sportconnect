# `/profile` page — design

**Status:** Design approved 2026-08-26, not implemented
**Source:** `client/design-reference/design-reference-profile.html` — cover banner + edit profile,
sport switcher, bio, Posts/Memories/Settings rail tabs, right rail (Upcoming/Trending/Group
broadcasts), comment dialog.
**Scoped from:** a `/feature` session that started from SPORT-2's own note that no page hosts
`SportAttributesFields` yet. Read `SPORT_ATTRIBUTE_SCHEMA_V2_DESIGN.md` for that component itself —
this doc only covers where it (and the rest of the page) lives.
**Filed as:** `PROFILE-0`..`PROFILE-9` (`client/docs/BACKLOG_MVP.md`), plus `ACCOUNT-1` filed
alongside but explicitly **not** part of this page (see §5).

---

## 1. Scope: own profile only

This is the caller's **own** profile — view and edit yourself. Nothing else in the app has a route
for viewing another user's profile today, and the design reference only shows self-view controls
(Edit profile, Settings, Log out). Viewing someone else's profile is a separate, unscoped feature.

## 2. What the mockup shows vs. what actually gets built

The mockup was a starting point, not the final scope — reading the real backend against it changed
several tabs substantially. Corrections made during scoping, in order:

| Mockup piece | What ships | Why |
|---|---|---|
| Cover, avatar, name/handle/location, bio | Real, full | Every field is 1:1 with existing `User`/`UserResponse` (`bio`, `avatarUrl`, `coverUrl`, `city`, `country`, `createdAt`) — nothing new server-side. |
| Posts tab (composer + own posts + likes/comments) | Real, full | `GET /api/posts/user/{userId}` already exists; `CreatePostForm`, `useCreatePost`, `CommentSection`, `usePost`, `useCommentsData` are all reusable as-is (see §3). Only gap: sport-chip filtering isn't a query param, so it happens client-side. |
| Memories tab (grouped "on this day" timeline, share/hide) | **`ComingSoonPage`, reused as-is inside the tab's content slot** | No backend concept exists for this at all — not even a plausible query over existing data, since "years ago" data doesn't meaningfully exist yet. Rather than build a mock timeline against nothing, this tab is a placeholder until it's actually scoped. |
| Settings tab (visibility picker + 3 toggles + Edit profile + Log out) | **Replaced entirely** — becomes a per-sport profile editor: `skillLevel` / `yearsOfExperience` / `preferredPosition` (first time editable anywhere in the app) + SPORT-2's `SportAttributesFields`, scoped to whichever sport is active in the page's own `SportSwitcher` | User decision during scoping: "setting tab is about sport profile setting + sport attribute setting (SPORT-2)". This is also the ticket that finally hosts SPORT-2. |
| "Edit profile" (mockup button had no form behind it) | Cover/avatar/bio + firstName/lastName/username/city/country → `PUT /api/users/{userId}/profile` | User decision: "profile modal is about cover avatar bio update (no sport profile update here)" — explicitly **not** where sport-profile editing lives; that's the Settings tab instead. |
| Visibility picker, 3 toggles, Log out | **Moved off this page entirely** — a new "Account settings" item on `TopBar`'s existing avatar `DropdownMenu` (which already has `Logout` wired) opens an Account Settings modal | User decision: "the account setting will be managed via account setting modal, triggered as an action on avatar dropdown menu... not belong to profile page." Filed as `ACCOUNT-1`, independent of this page. |
| Right rail (Upcoming/Trending/Group broadcasts) | Reused exactly as-is | Every data hook (`useUpcomingMatches`, `useTrendingHashtags`, `useGroupBroadcasts`) already reads the current user internally and is page-agnostic — already shared by Home Feed/Groups/Friends. |

## 3. Reuse inventory (confirmed by direct code read, not assumed)

- **`SportSwitcher`** (`shared/components/SportSwitcher.tsx`) — fully controlled, no store read inside
  itself. No shared store factory exists for the "active sport pill" — every page hand-writes its own
  (`homeFeedStore.ts`, `groupsPageStore.ts`, `matchesPageStore.ts`, same
  `create(persist(...))` shape, `sessionStorage`). `/profile` needs its own `profilePageStore.ts` in
  the same shape.
- **`TrendingHashtags`, `GroupBroadcasts`, `UpcomingMatches`/`SessionCard`** — presentational,
  `{ data, isLoading, isError }` props, generic hooks. Zero new code for the right rail.
- **`CreatePostForm` + `useCreatePost`** — reusable as-is for the Posts tab composer. Photo/Location/
  Tag-sport stay inert per FEED-3's established precedent; this page tags new posts with the active
  `SportSwitcher` pill instead (real signal, not the inert button).
- **`CommentSection`** — fully controlled (`post`/`comments` passed in, doesn't fetch itself). Caller
  wires `usePost(postId)` + `useCommentsData(postId, isOpen)`, same shape `HomeFeedPage` already uses
  for FEED-12's deep link.
- **`Collapsible`** — established idiom for grouping form sections inside a long `Dialog`
  (`CreateSessionModal` is the reference: `DialogContent fixedHeight` + internal
  `overflow-y-auto`, one `Collapsible` per section). This is the pattern for both the Settings tab
  (base sport-profile fields + `SportAttributesFields`) and the Edit Profile modal if it ends up
  needing sections.
- **Gaps that are genuinely new**: `useMyProfile()` (no hook fetches the full `UserResponse` for the
  logged-in user today — `useAuthStore`'s `User` is a thin login projection with no `bio`/`city`/
  `coverUrl`); a raw sport-profile hook (`useSportProfilesForUser` maps down to the display-only
  `SportProfile`, dropping `id`/`attributes`/`skillLevel`/`yearsOfExperience`/`preferredPosition` —
  Settings needs the raw shape); a client wrapper for `PUT /api/sports/profiles/{profileId}`
  (endpoint exists, no hook wraps it yet); `useUserPosts(userId)`.

## 4. Not changing

No backend work at all. No new migration, no new endpoint, no new DTO field. Every real piece this
page needs is already fully served — the entire scope here is client-only.

## 5. `ACCOUNT-1` is deliberately excluded from this page's ticket chain

Filed alongside these tickets but with no dependency relationship to any of them. It lives on
`TopBar` (a shared, cross-page component), not `/profile`, and covers a different concern (account-
level privacy/notification preferences) than this page (identity + per-sport data). Whether its three
toggles map onto the real `notificationEmail`/`Push`/`Sms` fields (relabeled) or stay local-only mock
is left open, to be decided at that ticket's own pickup.

## 6. Ticket breakdown and dependency order

```
PROFILE-0 (types + hooks scaffold) ─┬─> PROFILE-1 (ProfileHeader)
                                     ├─> PROFILE-2 (Posts tab)
                                     ├─> PROFILE-3 (Memories tab placeholder)
                                     ├─> PROFILE-5 (Edit Profile modal)
                                     └─> PROFILE-4 (Settings tab) ──> also needs SPORT-2 (hard)
PROFILE-1, PROFILE-2, PROFILE-3, PROFILE-4, PROFILE-5 ──> PROFILE-6 (ProfilePage integration)
PROFILE-6 ──> PROFILE-7 (hardening: responsive/a11y/visual regression)
PROFILE-6 ──> PROFILE-8 (E2E journey)
Everything above ──> PROFILE-9 (QA/acceptance checklist)

ACCOUNT-1 — independent, no dependency on any PROFILE-* ticket.
```

Visual regression baseline for `PROFILE-7`: `client/design-reference/design-reference-profile.html`
(already in the repo), same convention as every other screen's `design-reference-*.html`.
