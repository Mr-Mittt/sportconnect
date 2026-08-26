# ACCOUNT-1 · Account Settings modal

**Status:** `TODO` · **Type:** Component · **Depends on:** none ·
**Filed:** 2026-08-26, split out of the `/profile` page `/feature` scoping session — user decision:
"the account setting will be managed via account setting modal, triggered as an action on avatar
dropdown menu... not belong to profile page" ·
**Design:** `client/docs/PROFILE_PAGE_DESIGN.md` §5 (context only — this ticket's own design is not
done yet, see below)

## What ships

A new "Account settings" item on `TopBar`'s existing avatar `DropdownMenu` (`shared/components/
TopBar.tsx`, which already has `DropdownMenuItem onSelect={onLogout}` wired for logout) — sits
alongside `Logout`, opens an Account Settings modal covering account-level preferences, independent
of `/profile` (a different page entirely) and every `PROFILE-*` ticket.

**Confirmed real, backed today:**
- Profile visibility — `privacyProfile` on `UserPreference`, `GET`/`PUT /api/users/me/preferences`
  (`UserPreferenceController`, already exists, auto-creates defaults on first access). Values today:
  `public`/`friends`/`private` (`UserPreference.privacyProfile` default `"public"`).

**Open, to decide at this ticket's own pickup (deliberately not resolved here):**
- The mockup's three toggles (Activity sharing / Tagging / Weekly digest) don't describe any feature
  that exists in the app — no auto-post-match-results, no friend-tagging-permission concept. The real
  `UserPreference` fields are `notificationEmail`/`notificationPush`/`notificationSms`, which are a
  different concept (notification channel, not behavior toggle). Decide at pickup whether to: (a) drop
  the three toggles entirely, (b) relabel and wire them to the real notification-channel fields, or
  (c) ship them local-only/unsaved with a disclaimer (`GroupChatTab` precedent). Don't guess here —
  this needs its own short design pass, not an inherited assumption from the `/profile` scoping
  session that split this ticket out.
- Whether Log out itself moves into this modal too, or stays exactly where it already is on
  `TopBar`'s dropdown (simplest: leave `Logout` where it is, this ticket only adds one new sibling
  item that opens the modal).

## Explicitly out of scope

Anything already covered by a `PROFILE-*` ticket (identity fields, sport-profile data) — this modal is
account-level only.

## Tests

Vitest/RTL — dropdown gains the new item; modal opens/closes; visibility picker round-trips through
the real mutation. Exact toggle tests depend on the open design question above being resolved first.
