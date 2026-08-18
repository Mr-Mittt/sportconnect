# B6a · Pinned posts

**Status:** `DONE`  
**Type:** New Feature  
**Dependency:** B3 (GROUP_POST type must exist)  
**Entity needed:** `GroupPinnedPost` (groupId, postId, pinOrder 1–3, pinnedBy: UUID, pinnedAt)

- Owner pins/unpins any existing `GROUP_POST`
- Max 3 pinned per group
- Pinned posts appear truncated (1 line) at the top of the group feed, ordered by `pinOrder`

Endpoints:
- `POST /api/groups/{groupId}/pins` — pin a post
- `DELETE /api/groups/{groupId}/pins/{postId}` — unpin a post

---
