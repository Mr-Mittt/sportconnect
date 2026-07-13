# FEED-0 · Types + TanStack Query hooks scaffold

**Status:** DONE (2026-07-13) · **Type:** Foundation · **Dependency:** AUTH-0 · **Spec:** AUTH/FEED epic § FEED-0

## What this ticket does

Foundation ticket for Phase 6 (Feed/groups/sport integration) — shared TypeScript types and
TanStack Query hooks for posts, comments, groups, and hashtags, the real-backend foundation FEED-1
through FEED-7 build on. No UI/component/page changes — nothing in `home-feed` was touched.

## Approved design (Phase 3)

1. **Types** (`src/features/feed/types.ts`): `PostType`, `PostVisibility`, `PostMedia`, `Comment`
   (recursive), `Post`, `Hashtag`, `Group`, `GroupMember`, `CreatePostPayload`,
   `CreateCommentPayload`, and a generic `PageResponse<T>` matching Spring Data's `Page<T>` JSON
   shape. Reuses `@/shared/types/api`'s `ApiResponse<T>`.
2. **Query keys** (`src/features/feed/queryKeys.ts`): a `feedKeys` factory so mutations invalidate
   by a shared prefix rather than hardcoding key arrays inline.
3. **Hooks** (`src/features/feed/hooks/`, one file each, native TanStack shape — no custom
   wrapping): `usePersonalFeed`, `useGroupFeed`, `usePostsByHashtag` (all `useInfiniteQuery`,
   page-number pagination); `useTrendingHashtags`, `useActiveBroadcasts`, `useUserGroups` (plain
   `useQuery`, first-page-is-the-whole-list per the epic's scope); `useLikePost`, `useUnlikePost`,
   `useDeletePost`, `useCreatePost` (mutations, invalidate `feedKeys.all` on success).
4. **MSW handlers** (`e2e/mocks/handlers/feed.ts`, wired into `index.ts`; fixtures added to
   `fixtures.ts`), per the user's decision to build these now rather than defer to FEED-1/6/7.
5. **Tests**: one `.test.tsx`/`.test.ts` per hook, plus a dedicated `pagination.test.ts` (see
   "What diverged" below).

Scope decisions confirmed with the user before implementation: build the full hook set (not a
narrower FEED-1-only subset), add MSW handlers now, no UI wiring in this ticket, and proceed with
`number`-typed ids (see the Snowflake-ID tangent below).

## Snowflake ID tangent (before implementation)

Mid-ticket, investigated whether `Post`/`Comment`/`Group`/`GroupMember`/`Hashtag` should be
Snowflake-ID-ready from the start. Findings: `User` uses `GenerationType.UUID`, everything else uses
`GenerationType.IDENTITY`/`BIGSERIAL`, with **no documented rationale anywhere in the repo** for the
split (confirmed via a dedicated search — not just assumed). Decision: proceed with `number` for
these ids now (matches the backend's actual current type), but filed two backend V1 tickets ahead of
time so the eventual migration doesn't collide with unplanned client rework:
- `modules/social/post-impl/docs/BACKLOG_V1.md` · **C11** (Post/Comment/Hashtag → Snowflake, builds
  the shared generator in `modules/common`)
- `modules/social/group-impl/docs/BACKLOG_V1.md` · **A1** (Group/GroupMember → Snowflake, reuses
  C11's generator)

Both tickets document the client-side impact explicitly (a `number` → `string` flip is required when
they ship, because a real Snowflake value can exceed `Number.MAX_SAFE_INTEGER`) so the next person
picking this up doesn't have to re-derive it.

## What was built

Matches the approved design above exactly — no scope changes during implementation.

## What diverged from the approved design

**One test-infra fix was needed that wasn't anticipated:** `e2e/mocks/fixtures.ts` (covered by
`tsconfig.node.json`) started importing `src/features/feed/types.ts`, which itself imports
`@/shared/types/api` via the `@` alias. `tsconfig.node.json` had no `paths`/`baseUrl` and used
`module: "nodenext"` (strict-extension ESM resolution) — the combination made `tsc -b` fail with
`Cannot find module '@/shared/types/api'` specifically when building the whole project (not when
type-checking `tsconfig.app.json` alone). This never surfaced before because the only other src file
pulled into the node-side program this way (`auth/types.ts`) has zero imports of its own. Fixed by
adding `baseUrl`/`paths` to `tsconfig.node.json` and switching its `module`/`moduleResolution` from
`nodenext` to `esnext`/`bundler` (safe — these files are `noEmit: true`, type-check-only; actual
execution goes through Vite/Playwright's own loaders, not `tsc`). This is real, permanent
infrastructure, not a one-off workaround — any future feature `types.ts` with its own `@/` import
that gets referenced from `e2e/mocks/` would have hit the same wall.

**One flaky test was replaced, not just patched:** an initial `usePersonalFeed.test.tsx` case drove
`fetchNextPage()` through a full `renderHook` + `act()` + `waitFor()` cycle to verify page-number
advancement. It failed intermittently under full-suite parallel test-file execution (CPU contention
across ~37 jsdom environments), even after raising the `waitFor` timeout to 8000ms — but passed
reliably both in isolation and with `vitest run --no-file-parallelism`, confirming it was
environment contention, not a logic bug. Rather than keep tuning timeouts, extracted the page-number
derivation itself into a pure function (`src/features/feed/pagination.ts`, shared by all three
infinite-query hooks — it was duplicated inline three times before this) and unit-tested it directly
with no jsdom/renderHook involvement at all (`pagination.test.ts`). This is a better test for the
actual logic in question, not just a workaround for the flake.

**Three real backend-contract gaps were found during Phase 5's live-backend verification** (not
optional per this ticket's own convention: "MSW passing is not proof the real contract matches").
Registered a real user, created real posts/comments, and called every endpoint this ticket's hooks
touch directly via `curl`, comparing the raw JSON against `types.ts` field-for-field:

1. **`Post.userFullName`/`sportName`/`shareCount` are never populated** —
   `PostServiceImpl.mapToResponse()` has no builder call for any of the three; confirmed via three
   live endpoints, and confirmed `CommentResponse.userFullName` resolves correctly on the exact same
   account (so it's a Post-specific gap, not a user-data issue). Fixed the client types to be
   nullable (matching reality) and filed backend bug **A9**
   (`modules/social/post-impl/docs/BACKLOG_MVP.md`) — blocks FEED-1.
2. **Hashtags never include a leading `#`** (real extraction regex captures the tag body only) —
   this is correct, permanent backend behavior, not a bug, but it contradicts HF-0/HF-3/HF-5's
   mock-data convention. Fixed `usePostsByHashtag` to strip a leading `#` before calling the real
   endpoint (so it still accepts the UI's existing `#`-prefixed convention), fixed MSW fixtures to
   match, and documented the mismatch for FEED-1/FEED-6.
3. **`GET /api/posts/hashtag/{tag}` 500s unconditionally** — a genuine query bug (the repository's
   static `ORDER BY` collides with the controller's default-sort `Pageable`, and Spring Data JPA
   appends a second, invalid `ORDER BY` against the wrong entity). Filed backend bug **A10**
   (`modules/social/post-impl/docs/BACKLOG_MVP.md`) — blocks FEED-6 entirely until fixed.
   `usePostsByHashtag` is typed and wired correctly against the documented contract but cannot
   return real data today.

None of these three findings required changing this ticket's own scope or design — they're
documented as blockers for the tickets that actually consume the affected behavior (FEED-1, FEED-6),
not built around here.

## Verification

- `pnpm build` (`tsc -b` + `vite build`): clean.
- `pnpm lint`: clean.
- `pnpm test`: 142/142 passing, 3 consecutive clean runs (confirming the earlier flake is gone).
- `pnpm e2e`: 29/29 passing (unchanged suite — MSW's `feed.ts` handlers exist but nothing consumes
  them yet, matching this ticket's explicit no-UI-wiring scope).
- Live-backend verification (`./gradlew :server:bootRun` against the local dev Postgres/Redis):
  registered a real user, created real posts/comments, called `/posts/feed`, `/posts/group/{id}`,
  `/posts/broadcast`, `/hashtags/trending`, `/groups/user/{id}`, `/posts/{id}/like`
  (like+unlike+delete), and `/posts/{id}/comments` directly. `PageResponse<T>`'s envelope matched
  exactly everywhere; the three gaps above were the only mismatches found, all backend-side and now
  filed as tickets.

## Key decisions

- **`number` for Post/Comment/Group/GroupMember/Hashtag ids**, deliberately, with the Snowflake
  follow-up path pre-filed rather than hedged into `string` speculatively.
- **Blunt mutation invalidation** (`feedKeys.all`) rather than per-mutation targeted invalidation —
  correct for a foundation ticket; FEED-1 layers true optimistic update/rollback on top where it
  actually matters (the like/unlike flip), per `CLAUDE.md`'s controlled-component convention.
- **`usePostsByHashtag` normalizes the `#` prefix at the hook boundary**, not at every call site —
  keeps the existing PostCard/TrendingHashtags click-callback convention (`#tag`) working unchanged
  while still calling the real endpoint correctly.
- **Found-bug documentation lives with the bug's fix, not scattered** — both A9 and A10 are single,
  complete tickets in `post-impl`'s own backlog (their natural home), cross-referenced from this
  ticket's backlog delta rather than duplicated.
