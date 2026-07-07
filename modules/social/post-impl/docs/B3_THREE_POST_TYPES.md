# B3 · Three Post Types — Implementation Summary

## What was built

Added a `postType` enum (`USER_FEED`, `GROUP_POST`, `GROUP_BROADCAST`) to the `Post` entity with enforcement at create time.

## Changes

| File | Change |
|---|---|
| `V016__add_post_type_to_posts.sql` | TRUNCATE posts CASCADE; add `post_type VARCHAR(20) NOT NULL DEFAULT 'USER_FEED'` + CHECK constraint + indexes |
| `post-api/.../PostType.java` | New enum: `USER_FEED`, `GROUP_POST`, `GROUP_BROADCAST` |
| `post-api/.../CreatePostRequest.java` | Added `PostType postType` field |
| `post-api/.../PostResponse.java` | Added `PostType postType` and `Long groupId` (previously missing from response) |
| `post-impl/.../Post.java` | Added `@Enumerated(EnumType.STRING) PostType postType` field, default `USER_FEED` |
| `post-impl/build.gradle` | Switched `id 'java'` → `id 'groovy'`; added Spock deps; added `group-api` dependency |
| `post-impl/.../PostServiceImpl.java` | Injected `GroupService`; added validation in `createPost`; `mapToResponse` now includes `postType` + `groupId` |
| `post-impl/.../PostRepository.java` | `findPublicPosts` now filters `postType = USER_FEED` instead of `groupId IS NULL` |
| `PostServiceImplSpec.groovy` | Full rewrite: added GroupService mock, new tests for all post type validation paths |

## Validation rules enforced in `createPost`

| Condition | Result |
|---|---|
| `postType` null | Defaults to `USER_FEED` |
| `USER_FEED` + non-null `groupId` | `BadRequestException` |
| `GROUP_POST` or `GROUP_BROADCAST` + null `groupId` | `BadRequestException` |
| `GROUP_POST` + user not a member | `BadRequestException` (via `GroupService.isGroupMember`) |
| `GROUP_BROADCAST` + user not owner or admin | `BadRequestException` (via `GroupService.isGroupOwner` + `isGroupAdmin`) |

## Key decisions

- **`postType` is separate from `visibility`** — they are orthogonal concerns. `visibility` controls public/friends/private; `postType` controls audience routing.
- **Cross-domain check via `group-api` interface** — `post-impl` depends on `group-api`, never `group-impl`. No circular dependency: `group-impl` has no dependency on `post-api`.
- **`TRUNCATE posts CASCADE`** in migration — dev environment; no data worth preserving.
- **`findPublicPosts` uses `postType = USER_FEED`** — semantically correct; GROUP_POST and GROUP_BROADCAST are never in the public feed regardless of `groupId`.
- **`groupId` added to `PostResponse`** — it was already on the entity but missing from the response DTO; fixed here.
- **Feed visibility filtering is out of scope** — who actually sees GROUP_BROADCAST in their feed is deferred to a future post-module ticket.

## Non-obvious constraint

`GROUP_BROADCAST` only checks owner/admin at create time. The actual audience filtering (showing it to all users with that sport in their UserSpace) is NOT implemented — that's a separate feed query ticket.
