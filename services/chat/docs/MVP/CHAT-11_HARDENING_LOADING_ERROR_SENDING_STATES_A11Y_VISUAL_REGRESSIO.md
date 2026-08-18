# CHAT-11 · Hardening — loading/error/sending states, a11y, visual regression

**Status:** `TODO` · **Type:** Hardening (client) · **Dependency:** CHAT-8, CHAT-9, CHAT-13,
CHAT-15, CHAT-16

Same shape as every other feature's hardening ticket in this repo's backlogs (e.g. `FEED-8`,
`HF-8`): responsive check at 375/768/1280px, keyboard/focus/screen-reader pass on both chat
surfaces and every new affordance CHAT-13, CHAT-15, CHAT-16 added (edit/delete menu, typing state,
attachment picker/preview — no receipt indicators, CHAT-14 is out of MVP scope), a "sending"
pending state if `useGroupChatData`/
`useDirectChatData` expose one, retry affordance on a failed send/load rather than a dead end.
Full visual-regression baselines only if these changes visibly alter either design reference beyond
what CHAT-8/CHAT-9 already captured in their own Storybook updates.

**Acceptance criteria:**
- No new axe violations on either the Groups or Friends page.
- `pnpm test`/`tsc -b`/`eslint` all clean; visual-regression run if in scope, recorded as
  conditional otherwise (matching this repo's existing "record what could and couldn't be verified"
  convention).

---
