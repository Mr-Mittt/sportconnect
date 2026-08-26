# PROFILE-1 · `ProfileHeader` component

**Status:** `TODO` · **Type:** Component · **Depends on:** `PROFILE-0` ·
**Filed:** 2026-08-26, from the `/profile` page `/feature` scoping session ·
**Design:** `client/docs/PROFILE_PAGE_DESIGN.md`

## What ships

`shared/components/ProfileHeader.tsx`, presentational and controlled, per the design reference's
cover-banner card:

```ts
interface ProfileHeaderProps {
  user: MyProfile;  // from PROFILE-0's useMyProfile()
  onEditProfile: () => void;  // opens PROFILE-5's modal; wired for real once that ticket lands
}
```

Renders: cover (decorative token-based pattern — no upload flow exists anywhere in the client today,
same gap `CreatePostForm`'s inert Photo button already has; `coverUrl`/`avatarUrl` render when set,
fall back to the existing initials-avatar/decorative-pattern treatment otherwise), avatar-initials
fallback (same idiom `TopBar`/`CreatePostForm` already use), name, `@username`, `city`, bio (empty
state: no bio line rendered at all, not a placeholder like "No bio yet" — matches how other optional
text fields in this app degrade), "Edit profile" button.

**Tests:** Vitest/RTL — renders with full data, with no bio, with no avatar/cover. **Storybook:** one
story per state above.

## Explicitly out of scope

The `SportSwitcher` above this card and the rail tabs below it are `PROFILE-6`'s job (page
integration) — this ticket is the header card only. `onEditProfile` is a no-op placeholder until
`PROFILE-5` exists.

---

## Implementation summary (2026-08-26)

**Built as approved**, with one naming delta and one design decision resolved at pickup (user
decision):

**Delta:** the spec above names the prop type `MyProfile` — PROFILE-0 actually shipped it as
`UserResponse` (`features/profile/types.ts`), not `MyProfile`. `ProfileHeaderProps.user` is typed
`UserResponse`.

**`shared/components/ProfileHeader.tsx`** — presentational and controlled, exactly the props shape
above. Reused precedent directly instead of inventing new patterns:
- Cover/avatar fallback follows `GroupCoverBanner`/`FriendProfilePanel` exactly: a plain
  `bg-surface-1` band, `coverUrl` overlaid as an `<img>` when set, **no decorative stripe pattern**.
  The mockup (`design-reference-profile.html` lines 49–50) shows a dark band with a diagonal
  white-stripe overlay — nothing like it exists anywhere else in this codebase (confirmed by
  grepping for `repeating-linear-gradient` and any `bg-[...]` decorative pattern — zero hits), and
  building it would have meant a new token plus a first-of-its-kind CSS treatment. **User decision
  at pickup: match the existing precedent instead** (`GroupCoverBanner`'s plain-band + optional-
  image-overlay shape) — no new token added, no pattern built.
- Avatar-initials fallback: local `initialsFor()` helper, matching the same helper duplicated in
  ~14 other components (`FriendProfilePanel`, `PostCard`, `CreatePostForm`, etc.) — not centralized,
  consistent with that established (if imperfect) convention.
- `username`/`city` each render only when non-null; the whole `@username · city` line is omitted
  entirely when both are null — extrapolated from the ticket's own explicit "no bio placeholder"
  rule to the other two optional text fields, which the spec didn't cover directly.
- "Edit profile" button: `Button variant="outline" size="sm"` + `IconPencil` (`size-4`, matching
  `AdminLayout`'s Log out button — the established icon size for text+icon small buttons).

**Tests:** 8 Vitest/RTL cases — full data, no bio (null and empty-string), no avatar (initials
fallback), username-null, city-null, both-null (line omitted), edit-profile click. **Storybook:** 5
stories (Default, NoBio, NoAvatarOrCover, WithAvatarAndCover, NoUsernameOrCity) — production
Storybook build completed successfully (proves every story renders without a runtime error); no
live browser/Storybook-dev walkthrough (Claude-in-Chrome extension not connected this session, same
gap PROFILE-0 noted).

**Verification:** `tsc -b` clean, `pnpm lint` clean (same 2 pre-existing unrelated warnings as
PROFILE-0), full Vitest suite green, `build-storybook` green.
