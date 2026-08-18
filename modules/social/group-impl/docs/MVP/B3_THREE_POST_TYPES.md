# B3 · Three post types

**Status:** `DONE`  
**Type:** New Feature (cross-module — touches post module)  
Add `postType` enum + nullable `groupId: Long` to `Post` entity.

| postType | groupId | Visible to |
|---|---|---|
| `GROUP_POST` | required | Group members only |
| `GROUP_BROADCAST` | required | All users who have that sport in their space |
| `USER_FEED` | null | User + their followers |

**Cross-domain rules:**
- `GROUP_BROADCAST` visibility: check `sportId` on group → filter by users with that sport via sport-api interface
- `USER_FEED` visibility: check `UserFollow` via social-api interface
- group-impl never imports post-impl; group membership checks go through `GroupService` interface

---
