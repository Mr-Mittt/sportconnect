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
