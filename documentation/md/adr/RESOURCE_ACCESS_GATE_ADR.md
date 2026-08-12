# ADR: Resource Access — Availability vs. Visibility Gates

**Status:** Decided (design), tickets filed 2026-08-11. `common` C2 (`ResourceGate<T>`) and
`post-impl` A14 (`PostGate`) implemented 2026-08-12 — see §9 for per-ticket status;
`session-impl` SESSION-10 (`SessionGate`) still not implemented. Written 2026-08-10
while scoping `post-impl`'s A14 (`modules/social/post-impl/docs/BACKLOG_MVP.md`) — enforcing
visibility/group-membership on single-item post paths. The discussion widened past A14 itself into
a durable, cross-cutting rule for how *every* domain with per-item access rules (today: `post-impl`;
imminently: `session-impl` via SESSION-10) should structure that check, and surfaced two concrete
bugs along the way (see §5). This doc is the canonical reference; **CLAUDE.md's "Resource access"
section is the short version every session reads by default — keep the two in sync if this design
changes.**

**Context:** A14 was scoped narrowly — `getGroupPosts` (list) already checks
`groupService.isGroupMember` before returning anything, but every single-item path
(`getPostById`, `getPostComments`, `createComment`, `likeComment`, `unlikeComment`) only checks the
post exists, never `visibility` or group membership. Scoping the fix raised three questions that
don't have a `post-impl`-only answer: what layer should the check live in, how flexible does the
design need to be (post has 4 `postType`s with 2 real rule shapes; session is about to need its own
rule via SESSION-10), and — since every module already depends on `common` — could `common` be a
legitimate shared point without violating the "cross-domain calls through `-api` only, no shared
domain logic" rule.

---

## 1. The core framework: two questions, not one

Every resource with per-item access rules (a `Post`, a `Session`, a `SessionComment` once SESSION-10
ships, a `Group` itself) answers two **independent** questions before a caller can read or act on
it:

1. **Is it available?** — existence/lifecycle. Not soft-deleted, and its parent chain (if any) is
   also still available. E.g. a `Post` is available only if `post.isActive` **and**, if it's
   group-scoped, its parent `Group` is still active.
2. **Is it visible to *this* caller?** — authorization, evaluated only once (1) is true. E.g. a
   `GROUP_POST` is visible only to members of its group; a `USER_FEED` post is visible per its
   `visibility` field; a session's comment thread is visible only to participants (widened below).

These were never explicitly separated in the existing code, and that's exactly what let a real bug
hide (§5.1): `GroupServiceImpl.isGroupMember()` answers "are you a member" while silently assuming
"...and the group still exists" — an assumption that broke the moment groups became soft-deletable,
because nothing re-checked it. Naming the two questions separately makes both easy to audit for
every resource, and gives every gate a natural, fixed evaluation order: check availability first
(unavailable → `404`-equivalent, `NotFoundException`), then check visibility (available but
not-visible → `403`-equivalent, `ForbiddenException`). If it doesn't exist, there is no visibility
rule left to evaluate.

## 2. What layer the check lives in

**Service-impl layer**, not the controller and not the query — the same layer A2's owner/moderator
check and A3's `isGroupMember` check already live in.

- **Not the controller:** business rules belong in the service layer already (established
  precedent); a controller-layer check also wouldn't protect a future same-JVM cross-domain caller
  going through the `-api` interface directly, only HTTP callers.
- **Not purely the query:** works for *list* endpoints, where the scope is known upfront (`groupId`
  → check membership → run a query scoped to that group). Doesn't fit *single-item* endpoints — you
  need to fetch the entity to know its `groupId`/`visibility`/participant set before you can decide
  anything, so those gate *after* fetching, inside the service method. List endpoints keep their
  existing "gate before querying" shape unchanged; this ADR only replaces the single-item paths'
  missing checks.

## 3. How flexible: table-driven per-type dispatch, no class hierarchy

`Post.postType` already splits into exactly 2 real visibility shapes across 4 enum values
(`USER_FEED` uses the `visibility` field; `GROUP_POST`/`GROUP_BROADCAST`/`GROUP_SYSTEM` all use
group membership). A Java 21 switch expression is enough — exhaustive (the compiler flags a new
`PostType` that isn't handled), each branch independently testable, and a new type's rule is a
one-line addition, not a rewrite:

```java
boolean isVisibleTo(Post post, UUID viewerId) {
    return switch (post.getPostType()) {
        case USER_FEED -> isOwnerOrPublicOrFriend(post, viewerId);
        case GROUP_POST, GROUP_BROADCAST, GROUP_SYSTEM -> groupService.isGroupMember(post.getGroupId(), viewerId);
    };
}
```

No `Strategy`-pattern class hierarchy, no runtime-pluggable rule registry — nothing here needs to be
swapped at runtime, so a switch is simpler and just as extensible. `session-impl` gets the same
treatment independently, keyed on `session.groupId != null` (or `sessionType`) instead of
`postType` — same pattern, zero shared code, because the two domains' actual rules don't overlap.

## 4. Can `common` be a shared point? Yes — for shape, never for logic

Earlier in this discussion a generic cross-domain `VisibilityGate<T>` in `common` was rejected: with
only one real consumer (`post-impl`) and domain-specific logic that can't be generalized (group
membership vs. friendship vs. session participation), a shared interface would be either an empty
marker or would force entities into an artificial common shape. That calculus changes once there are
**three real consumers** (`Post`, `Session`, and `SessionComment`'s own — possibly stricter — rule
once SESSION-10 ships) sharing the same *two-question shape*, even though none of them share logic.
`common` should hold exactly that shape, and nothing else:

```java
// modules/common/src/main/java/com/sportconnect/common/access/ResourceGate.java
public interface ResourceGate<T> {
    /** Existence/lifecycle only — not soft-deleted, parent chain (if any) also available. */
    boolean isAvailable(T resource);

    /** Assuming available, can this specific caller read/act on it? */
    boolean isVisibleTo(T resource, UUID viewerId);

    /** NotFoundException if unavailable, ForbiddenException if available-but-not-visible. */
    default T require(T resource, UUID viewerId, String notFoundMessage, String notVisibleMessage) {
        if (resource == null || !isAvailable(resource)) {
            throw new NotFoundException(notFoundMessage);
        }
        if (!isVisibleTo(resource, viewerId)) {
            throw new ForbiddenException(notVisibleMessage);
        }
        return resource;
    }
}
```

`common` has zero dependency on any domain's `-api` here — the interface doesn't know `Post` or
`Session` exist. Each domain implements it against its own entity, with its own cross-domain `-api`
calls, exactly like every other cross-domain interaction in this codebase already works:

```java
// post-impl's own class — no other domain touches this
class PostGate implements ResourceGate<Post> {
    private final GroupService groupService; // group-api, already a post-impl dependency

    public boolean isAvailable(Post post) {
        if (!post.getIsActive()) return false;
        return post.getGroupId() == null || groupService.isGroupActive(post.getGroupId()); // §5.1's fix, composed here
    }

    public boolean isVisibleTo(Post post, UUID viewerId) {
        return switch (post.getPostType()) { /* §3 */ };
    }
}
```

**What this buys, concretely:**
- A uniform execution order (existence-then-visibility) for free, via the `require()` default
  method, instead of every domain hand-rolling its own if/else ordering.
- A uniform exception convention — `NotFoundException` for "doesn't exist," `ForbiddenException` for
  "exists but you can't see it" — which also **fixes an existing inconsistency** (§5.2): today
  `post-impl` throws `BadRequestException` for some "you can't do this" cases (A2's owner check) and
  `ForbiddenException` for others (A3's membership check), for conceptually identical situations.
- Cross-domain composition (a `Post`'s availability depending on its parent `Group`'s availability)
  still happens by hand inside each domain's own `isAvailable`/`isVisibleTo` — the interface
  deliberately does **not** know how to walk a parent chain. A generic "walk the hierarchy"
  mechanism would need cross-domain relationship knowledge, which is exactly the coupling the
  architecture forbids. Each domain composes its own chain via its own existing `-api` calls, same
  as today.

## 5. Concrete findings surfaced by this discussion

### 5.1 `GroupServiceImpl.isGroupMember/isGroupOwner/isGroupAdmin` never check `group.isActive`

`deleteGroup` is a soft-delete (`group.setIsActive(false)`) — it never touches `group_members` rows.
But:

```java
public boolean isGroupMember(Long groupId, UUID userId) {
    return groupMemberRepository.existsByGroupIdAndUserId(groupId, userId);
}
```

...and `isGroupOwner`/`isGroupAdmin` (role lookups against the same table) never join against
`group.is_active`. Audited every cross-domain caller of these three methods
(8 call sites in `post-impl`, 1 in `session-impl`) — every single one uses the result as a live gate
("can this caller act *right now*"), never a historical/audit lookup. That means a former member of
a since-deleted group can still: create `GROUP_POST`s in it (`PostServiceImpl.createPost`), have
their owner/admin status honored to moderate posts in it (`deletePost`/`updatePost`/
`updateBroadcastEndTime`), list its posts (`getGroupPosts`, A3), and — via `session-impl` — still
pass the group-linked-session gate.

**Fix belongs at the source, in `group-impl`**, not per-caller: since every consumer already treats
these methods as "true right now," requiring `group.isActive` inside all three methods (or a shared
private helper feeding them) is correct for every existing and future caller in one change. This is
unlike the Account Lifecycle gap (root `CLAUDE.md`) — that gap was deliberately *not* fixed at the
JWT-filter choke point because of the already-issued-token staleness window; no equivalent
staleness/caching concern applies here, this is a pure repository-query correctness fix.

### 5.2 Inconsistent `BadRequestException` (400) vs. `ForbiddenException` (403) in `post-impl`

A3's `getGroupPosts` throws `ForbiddenException` for a non-member; A2's `deletePost` owner/moderator
check throws `BadRequestException` for the same *category* of denial ("you can't do this"). Adopting
§4's `ResourceGate.require()` convention going forward standardizes every new/refactored check on
`ForbiddenException` for "available but not visible" — existing call sites can be migrated
opportunistically, not required to change in the same pass as any one ticket.

## 6. Widened rule for group-linked sessions (delta on `SESSION_COMMENTS_VISION.md`)

The already-decided vision doc (`documentation/md/vision/SESSION_COMMENTS_VISION.md`, 2026-08-07)
scopes `SessionComment` read/write to `SessionParticipant` status only — participants-only, even for
a group-linked session, independent of the group's own membership. This discussion raised a
legitimate widening: for a **group-linked** session, group members (not just session participants)
should also be able to read/comment on that session's thread, since it's also effectively a group
post. This is a delta to file against SESSION-10 before it's implemented, not a reversal of the
vision doc's core decision (standalone sessions stay participant-only; the widening only applies
when `session.groupId != null`) — expressed the same way as `PostGate`, via `SessionGate`:

```java
public boolean isVisibleTo(Session session, UUID viewerId) {
    boolean isParticipant = participantStatusIn(session, viewerId, JOINED, REQUESTED, INVITED);
    boolean isGroupMember = session.getGroupId() != null && groupService.isGroupMember(session.getGroupId(), viewerId);
    return isParticipant || isGroupMember;
}
```

## 7. Rejected alternatives

- **Session's discussion thread modeled as a `Post`** (a new `PostType.SESSION_POST`/
  `GROUP_SESSION_POST`) — considered mid-discussion as a way to get comment
  nesting/likes/Redis-preview-cache for free instead of rebuilding them in `session-impl`. Rejected:
  this is a *stronger* form of something the vision doc already explicitly rejected ("reuse Post's
  actual `Comment` table/entity... this repo's domain-scoped-tables rule forbids a cross-domain JPA
  relationship or shared table here"). Making a session's core content literally a `posts` row would
  permanently weld `session-impl` to `post-impl` at the schema level (`session-impl` could never be
  extracted independently without either losing the feature or being extracted bundled with
  `post-impl`), and would require a **bidirectional** `-api` dependency (`post-impl` → `session-api`
  for the participant check, `session-impl` → `post-api` to create the companion post on session
  creation) — more entangling than either domain depending on the other one-way, which is already
  how every other cross-domain reference in this codebase works. SESSION-10 keeps its own
  domain-scoped `SessionComment`/`SessionCommentLike` tables, shape copied from `post-impl`'s
  comments, entity not shared — unchanged from the vision doc.
- **A fully generic, annotation/AOP-driven visibility framework in `common`** (e.g.
  `@RequiresVisibility` + a Spring aspect dispatching to a registered gate) — real value if the
  *logic* were reusable across domains, which it isn't; would add a real ceremony/discoverability
  cost (indirection through an aspect, harder to step through in a debugger) for a payoff that's
  mostly naming consistency, which §4's plain interface already achieves for a fraction of the cost.
  Revisit only if a config-driven/runtime-swappable rule set becomes a real requirement — it isn't
  today.
- **Controller-layer checks** — see §2.
- **Query-layer-only checks for single-item paths** — see §2; list endpoints keep this shape, it
  just doesn't extend to single-item fetches.

## 8. Open questions

- Should `Comment`'s own gate always inherit its parent `Post`'s `isVisibleTo` result, or is it
  legitimate for a sub-resource to layer a *stricter* rule on top (as `SessionComment` already does
  — a standalone session is publicly readable, but its comment thread is participant-only)? Current
  answer, implicit in §6: sub-resources may add restrictions, never remove them, but this hasn't
  been asserted anywhere in code yet — worth a comment on `CommentGate` (or equivalent) once it
  exists, not just tribal knowledge.
- Every `isAvailable`/`isVisibleTo` cross-domain call (e.g. `groupService.isGroupActive`,
  `groupService.isGroupMember`) is a live DB round-trip per single-item request today — fine at MVP
  scale, but if a hot single-item endpoint later shows this as a bottleneck, that's a caching
  question for the *owning* domain's `-api` implementation (e.g. `group-impl` adding a short-TTL
  cache to `isGroupActive`), not something `ResourceGate` itself should know about.

## 9. Filed tickets (2026-08-11)

- **`group-impl` B18** (`DONE`, 2026-08-11) — fix `isGroupMember`/`isGroupOwner`/`isGroupAdmin` to
  require `group.isActive`; add `isGroupActive(Long groupId)` to `GroupService` (§5.1). No
  dependency on the items below, but lands first — both A14's `PostGate.isAvailable` and
  SESSION-10's `SessionGate.isAvailable` call `isGroupActive`.
- **`common` C2** (`DONE`, 2026-08-11) — add `ResourceGate<T>` (§4) plus a short Javadoc pointing
  back to this ADR.
- **`post-impl` A14** (`DONE`, 2026-08-12, redesigned) — implemented `PostGate`, applied to the 5
  single-item paths named in A14's existing scope; standardized on `ForbiddenException` per §5.2
  for this ticket's own denial cases (existing call sites outside A14's scope migrate
  opportunistically, not in this pass). Two deltas beyond this section's original scope, both
  user-directed during implementation: `likeComment`/`unlikeComment` also gate the comment's own
  availability before the parent-post `PostGate` check (not just the post, as originally written
  here); `friends`-visibility (§7's out-of-scope item for A14 specifically) was implemented for
  real rather than left deferred, since `UserFriendService.areFriends` already existed with no new
  dependency; and `PostServiceImpl.likePost`/`unlikePost` — never named anywhere in this ADR or
  A14's own scope, spotted as a post-merge follow-up — had the identical unguarded pattern and
  were gated the same way, bringing the actual count to 7 single-item paths, not the 5 originally
  identified. Detail: `modules/social/post-impl/docs/A14_POST_RESOURCE_GATE.md`.
- **`session-impl` SESSION-10** (`TODO`, gating redesigned) — implement `SessionGate` from the
  start against `ResourceGate<T>`, including §6's group-member widening as part of its initial
  scope, not a follow-up.
