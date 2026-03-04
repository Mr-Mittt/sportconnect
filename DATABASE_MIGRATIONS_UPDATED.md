# Database Migrations - Group Functionality (UPDATED)

## Changes Based on User Feedback

✅ **1. Created `group_roles` table** - Using `role_id` instead of string-based roles  
✅ **2. Added `group_settings` table** - For extensible group configuration  
✅ **3. Added `system_action_type`** - To track all owner/admin actions with system posts  
✅ **4. Kept `is_private` field** - For future public group browsing feature  

---

## Migration Files (6 Total)

### V007__create_group_roles_table.sql
**Purpose:** Define available group roles with permission hierarchy

**Table:** `group_roles`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Role ID |
| role_name | VARCHAR(50) | UNIQUE NOT NULL | Role name |
| description | TEXT | - | Role description |
| level | INTEGER | NOT NULL | Permission level (3=owner, 2=admin, 1=member) |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW | Creation timestamp |

**Pre-populated Data:**
```sql
INSERT INTO group_roles (role_name, description, level) VALUES
    ('group_owner', 'Full control, one per group', 3),
    ('group_admin', 'Elevated permissions', 2),
    ('group_member', 'Regular member', 1);
```

**Benefits:**
- ✅ Centralized role definitions
- ✅ Easy to add new roles in future
- ✅ Permission hierarchy via `level` field
- ✅ Higher level inherits lower level permissions

---

### V008__create_groups_table.sql
**Purpose:** Main groups table for storing group/club information

**Table:** `groups`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | Auto-incrementing group ID |
| group_name | VARCHAR(100) | UNIQUE NOT NULL | Unique group identifier |
| description | TEXT | - | Group description |
| avatar_url | VARCHAR(500) | - | Group avatar image |
| cover_url | VARCHAR(500) | - | Group cover image |
| is_private | BOOLEAN | DEFAULT false | Privacy setting |
| is_active | BOOLEAN | DEFAULT true | Soft delete flag |
| created_by | UUID | NOT NULL, FK → users(id) | Group creator |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW | Creation timestamp |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW | Last update timestamp |

**Indexes:**
- `idx_groups_group_name` on `group_name`
- `idx_groups_created_by` on `created_by`
- `idx_groups_is_active` on `is_active`
- `idx_groups_is_private` on `is_private` *(new)*

**Note:** `is_private` kept for future feature where users can browse public groups

---

### V009__create_group_members_table.sql
**Purpose:** Track user membership with role-based access control

**Table:** `group_members`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | Membership ID |
| group_id | BIGINT | NOT NULL, FK → groups(id) | Group reference |
| user_id | UUID | NOT NULL, FK → users(id) | User reference |
| role_id | INTEGER | NOT NULL, FK → group_roles(id) | Role reference *(changed)* |
| joined_at | TIMESTAMP | NOT NULL, DEFAULT NOW | Join timestamp |

**Unique Constraint:**
- `unique_group_user` on `(group_id, user_id)`

**Indexes:**
- `idx_group_members_group_id` on `group_id`
- `idx_group_members_user_id` on `user_id`
- `idx_group_members_role_id` on `role_id` *(new)*
- `idx_group_members_group_role` on `(group_id, role_id)` *(new - composite)*

**Changes from Original:**
- ❌ Removed: `role VARCHAR(20)` with CHECK constraint
- ✅ Added: `role_id INTEGER` referencing `group_roles(id)`

---

### V010__create_group_join_requests_table.sql
**Purpose:** Manage join request workflow

**Table:** `group_join_requests`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | Request ID |
| group_id | BIGINT | NOT NULL, FK → groups(id) | Target group |
| user_id | UUID | NOT NULL, FK → users(id) | Requesting user |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'pending', CHECK | Request status |
| message | TEXT | - | Optional message |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW | Request timestamp |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW | Last update |
| reviewed_by | UUID | FK → users(id) | Reviewing admin |
| reviewed_at | TIMESTAMP | - | Review timestamp |

**Status Values:** `pending`, `accepted`, `declined`

**Unique Constraint:**
- `idx_unique_pending_request` on `(group_id, user_id)` WHERE `status = 'pending'`

**Indexes:**
- `idx_group_join_requests_group_id` on `group_id`
- `idx_group_join_requests_user_id` on `user_id`
- `idx_group_join_requests_status` on `status`

---

### V011__create_group_settings_table.sql *(NEW)*
**Purpose:** Extensible group configuration settings

**Table:** `group_settings`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | Settings ID |
| group_id | BIGINT | UNIQUE NOT NULL, FK → groups(id) | Group reference |
| allow_member_posts | BOOLEAN | DEFAULT true | Members can create posts |
| require_post_approval | BOOLEAN | DEFAULT false | Posts need admin approval |
| allow_member_invites | BOOLEAN | DEFAULT false | Members can invite others |
| max_members | INTEGER | - | Max members (null = unlimited) |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW | Creation timestamp |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW | Last update timestamp |

**Index:**
- `idx_group_settings_group_id` on `group_id`

**Future Extensibility:**
Can easily add more settings columns like:
- `allow_member_comments`
- `post_moderation_mode`
- `notification_settings`
- `visibility_settings`

---

### V012__add_group_fields_to_posts.sql
**Purpose:** Extend posts table for group posts and system tracking

**Changes to `posts` table:**

| Column Added | Type | Constraints | Description |
|--------------|------|-------------|-------------|
| group_id | BIGINT | FK → groups(id), nullable | Group association |
| is_hidden | BOOLEAN | NOT NULL, DEFAULT false | Admin moderation |
| is_system_post | BOOLEAN | NOT NULL, DEFAULT false | Auto-generated post |
| system_action_type | VARCHAR(50) | - | Action type *(new)* |

**System Action Types:**
- `member_joined` - User joined group
- `member_removed` - User removed from group
- `member_left` - User left group
- `role_changed` - User role updated
- `admin_assigned` - User promoted to admin
- `admin_removed` - Admin demoted
- `ownership_transferred` - Owner changed
- `post_hidden` - Post hidden by admin
- `post_unhidden` - Post unhidden by admin
- `settings_updated` - Group settings changed
- `group_created` - Group created
- `group_updated` - Group info updated

**Indexes:**
- `idx_posts_group_id` on `group_id`
- `idx_posts_is_hidden` on `is_hidden`
- `idx_posts_is_system_post` on `is_system_post` *(new)*
- `idx_posts_group_id_is_hidden` on `(group_id, is_hidden)` WHERE `group_id IS NOT NULL`

---

## Database Relationships (Updated)

```
group_roles (lookup table)
  ↓ (role_id)
group_members ← users (user_id)
  ↑ (group_id)
groups ← users (created_by)
  ↓ (group_id)
  ├── group_settings (1:1)
  ├── group_join_requests ← users (user_id, reviewed_by)
  └── posts (group_id, nullable)
```

---

## Migration Execution Order

1. **V007** - Create `group_roles` table (standalone)
2. **V008** - Create `groups` table (depends on `users`)
3. **V009** - Create `group_members` table (depends on `groups`, `users`, `group_roles`)
4. **V010** - Create `group_join_requests` table (depends on `groups`, `users`)
5. **V011** - Create `group_settings` table (depends on `groups`)
6. **V012** - Alter `posts` table (depends on `groups`)

---

## System Post Examples

When admin actions occur, system posts are automatically created:

**Member Joined:**
```
Content: "[group_admin] John Doe has accepted join request from Jane Smith"
system_action_type: "member_joined"
is_system_post: true
```

**Member Removed:**
```
Content: "[group_admin] John Doe has removed member Jane Smith"
system_action_type: "member_removed"
is_system_post: true
```

**Role Changed:**
```
Content: "[group_owner] John Doe has promoted Jane Smith to group_admin"
system_action_type: "role_changed"
is_system_post: true
```

**Post Hidden:**
```
Content: "[group_admin] John Doe has hidden a post by Jane Smith"
system_action_type: "post_hidden"
is_system_post: true
```

**Settings Updated:**
```
Content: "[group_owner] John Doe has updated group settings"
system_action_type: "settings_updated"
is_system_post: true
```

---

## Key Improvements

### 1. Role Management
**Before:** String-based roles with CHECK constraint
```sql
role VARCHAR(20) CHECK (role IN ('group_owner', 'group_admin', 'group_member'))
```

**After:** Normalized with `group_roles` table
```sql
role_id INTEGER REFERENCES group_roles(id)
```

**Benefits:**
- ✅ Centralized role definitions
- ✅ Easy to add new roles (e.g., `group_moderator`)
- ✅ Permission hierarchy via `level` field
- ✅ Better data integrity

### 2. Group Settings
**New table for extensibility:**
- Start with basic settings
- Easy to add new columns for future features
- One-to-one relationship with groups
- Default values for backward compatibility

### 3. System Action Tracking
**Enhanced system posts:**
- `is_system_post` flag identifies auto-generated posts
- `system_action_type` categorizes the action
- All owner/admin actions tracked
- Provides audit trail and transparency

---

## Performance Considerations

**Total Indexes:** 17 across all tables
- 4 on `groups`
- 4 on `group_members` (including composite)
- 4 on `group_join_requests` (including partial unique)
- 1 on `group_settings`
- 4 on `posts` (new group-related)

**Optimized Queries:**
- ✅ Get user's groups: `JOIN group_members ON user_id`
- ✅ Get group members by role: `JOIN group_members ON role_id`
- ✅ Get pending requests: `WHERE status = 'pending'` (indexed)
- ✅ Get visible group posts: `WHERE group_id = ? AND is_hidden = false` (composite index)
- ✅ Get system posts: `WHERE is_system_post = true` (indexed)

---

## Storage Estimates

**Assumptions:** 10,000 users, 1,000 groups, 100,000 posts

| Table | Rows | Size per Row | Total Size |
|-------|------|--------------|------------|
| group_roles | 3 | ~100 bytes | ~300 bytes |
| groups | 1,000 | ~500 bytes | ~500 KB |
| group_members | 10,000 | ~50 bytes | ~500 KB |
| group_join_requests | 5,000 | ~100 bytes | ~500 KB |
| group_settings | 1,000 | ~100 bytes | ~100 KB |
| posts (group posts) | 50,000 | ~1 KB | ~50 MB |

**Total Additional Storage:** ~52 MB

---

## Next Steps

1. ✅ **Migrations Created** - 6 SQL files ready
2. ✅ **Changelog Updated** - Liquibase will execute in order
3. ⏳ **Review & Approve** - Verify all changes are correct
4. ⏳ **Apply Migrations** - Run server to execute Liquibase
5. ⏳ **Create Entities** - Java entities for all tables
6. ⏳ **Create Repositories** - JPA repositories
7. ⏳ **Implement Services** - Business logic with system post creation
8. ⏳ **Create Controllers** - REST API endpoints

---

## Summary of Changes

**Added:**
- ✅ `group_roles` table for normalized role management
- ✅ `group_settings` table for extensible configuration
- ✅ `system_action_type` column for categorizing system posts
- ✅ Additional indexes for role-based queries
- ✅ `is_private` index for future public group browsing

**Improved:**
- ✅ Role management (string → foreign key)
- ✅ System post tracking (all admin actions)
- ✅ Future extensibility (settings table)
- ✅ Query performance (composite indexes)

**Ready for implementation!** 🚀
