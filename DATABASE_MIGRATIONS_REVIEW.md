# Database Migrations Review - Group Functionality

## Overview
This document lists all database changes for the group functionality feature. Please review before applying migrations.

---

## Migration Files Created

### 1. V007__create_groups_table.sql
**Purpose:** Create the main groups table for storing group/club information

**Table:** `groups`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | Auto-incrementing group ID |
| group_name | VARCHAR(100) | UNIQUE NOT NULL | Unique identifier name for the group |
| description | TEXT | - | Optional group description |
| avatar_url | VARCHAR(500) | - | URL to group avatar image |
| cover_url | VARCHAR(500) | - | URL to group cover image |
| is_private | BOOLEAN | DEFAULT false | If true, group is invite-only |
| is_active | BOOLEAN | DEFAULT true | Soft delete flag |
| created_by | UUID | NOT NULL, FK → users(id) | User who created the group |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW | Creation timestamp |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW | Last update timestamp |

**Indexes:**
- `idx_groups_group_name` on `group_name` (for lookups)
- `idx_groups_created_by` on `created_by` (for user's groups)
- `idx_groups_is_active` on `is_active` (for filtering active groups)

**Foreign Keys:**
- `created_by` → `users(id)` ON DELETE CASCADE

---

### 2. V008__create_group_members_table.sql
**Purpose:** Track user membership in groups with role-based access control

**Table:** `group_members`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | Auto-incrementing membership ID |
| group_id | BIGINT | NOT NULL, FK → groups(id) | Reference to group |
| user_id | UUID | NOT NULL, FK → users(id) | Reference to user |
| role | VARCHAR(20) | NOT NULL, CHECK | User role in group |
| joined_at | TIMESTAMP | NOT NULL, DEFAULT NOW | When user joined the group |

**Role Values (CHECK constraint):**
- `group_owner` - One per group, full control
- `group_admin` - Multiple allowed, elevated permissions
- `group_member` - Default role for accepted members

**Unique Constraint:**
- `unique_group_user` on `(group_id, user_id)` - One membership per user per group

**Indexes:**
- `idx_group_members_group_id` on `group_id` (for group member lists)
- `idx_group_members_user_id` on `user_id` (for user's groups)
- `idx_group_members_role` on `role` (for role-based queries)

**Foreign Keys:**
- `group_id` → `groups(id)` ON DELETE CASCADE
- `user_id` → `users(id)` ON DELETE CASCADE

---

### 3. V009__create_group_join_requests_table.sql
**Purpose:** Manage user requests to join groups and admin approval workflow

**Table:** `group_join_requests`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | Auto-incrementing request ID |
| group_id | BIGINT | NOT NULL, FK → groups(id) | Group user wants to join |
| user_id | UUID | NOT NULL, FK → users(id) | User requesting to join |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'pending', CHECK | Request status |
| message | TEXT | - | Optional message from user |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW | When request was created |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW | Last status update |
| reviewed_by | UUID | FK → users(id) | Admin who reviewed request |
| reviewed_at | TIMESTAMP | - | When request was reviewed |

**Status Values (CHECK constraint):**
- `pending` - Awaiting admin review (default)
- `accepted` - Request approved by admin
- `declined` - Request rejected by admin

**Unique Constraint:**
- `idx_unique_pending_request` on `(group_id, user_id)` WHERE `status = 'pending'`
  - Ensures only one pending request per user per group
  - Allows multiple declined/accepted requests (history)

**Indexes:**
- `idx_group_join_requests_group_id` on `group_id` (for group's pending requests)
- `idx_group_join_requests_user_id` on `user_id` (for user's requests)
- `idx_group_join_requests_status` on `status` (for filtering by status)

**Foreign Keys:**
- `group_id` → `groups(id)` ON DELETE CASCADE
- `user_id` → `users(id)` ON DELETE CASCADE
- `reviewed_by` → `users(id)` (nullable)

---

### 4. V010__add_group_fields_to_posts.sql
**Purpose:** Extend posts table to support group posts and visibility control

**Changes to `posts` table:**

| Column Added | Type | Constraints | Description |
|--------------|------|-------------|-------------|
| group_id | BIGINT | FK → groups(id), nullable | If set, post belongs to a group |
| is_hidden | BOOLEAN | NOT NULL, DEFAULT false | Admin can hide posts |
| is_system_post | BOOLEAN | NOT NULL, DEFAULT false | Auto-generated admin action posts |

**Logic:**
- `group_id = NULL` → Personal post (existing behavior)
- `group_id = <id>` → Group post
- `is_hidden = true` → Only admins can see (moderation)
- `is_system_post = true` → Created automatically for admin actions

**Indexes:**
- `idx_posts_group_id` on `group_id` (for group post queries)
- `idx_posts_is_hidden` on `is_hidden` (for filtering visible posts)
- `idx_posts_group_id_is_hidden` on `(group_id, is_hidden)` WHERE `group_id IS NOT NULL`
  - Composite index for efficient group post filtering

**Foreign Keys:**
- `group_id` → `groups(id)` ON DELETE CASCADE

---

## Database Relationships

```
users (existing)
  ↓ (created_by)
groups
  ↓ (group_id)
  ├── group_members ← users (user_id)
  ├── group_join_requests ← users (user_id, reviewed_by)
  └── posts (group_id, nullable)
```

---

## Migration Execution Order

1. **V007** - Create `groups` table (depends on `users`)
2. **V008** - Create `group_members` table (depends on `groups`, `users`)
3. **V009** - Create `group_join_requests` table (depends on `groups`, `users`)
4. **V010** - Alter `posts` table (depends on `groups`)

**Note:** Liquibase will execute these in order automatically.

---

## Data Integrity Rules

### Cascading Deletes
- **Delete User** → Deletes their groups, memberships, join requests, posts
- **Delete Group** → Deletes all members, join requests, group posts

### Constraints
- Group name must be unique across all groups
- User can only have one membership per group
- User can only have one pending join request per group
- Group must have exactly one `group_owner` (enforced in application logic)
- Role must be one of: `group_owner`, `group_admin`, `group_member`
- Join request status must be one of: `pending`, `accepted`, `declined`

---

## Performance Considerations

### Indexed Queries (Fast)
✅ Find group by name: `SELECT * FROM groups WHERE group_name = ?`
✅ Get user's groups: `SELECT * FROM group_members WHERE user_id = ?`
✅ Get group members: `SELECT * FROM group_members WHERE group_id = ?`
✅ Get pending requests: `SELECT * FROM group_join_requests WHERE group_id = ? AND status = 'pending'`
✅ Get group posts: `SELECT * FROM posts WHERE group_id = ? AND is_hidden = false`

### Composite Index Benefits
- `(group_id, is_hidden)` on posts enables fast filtering of visible group posts
- `(group_id, user_id)` unique constraint also serves as an index

---

## Storage Estimates (Approximate)

**Assumptions:** 10,000 users, 1,000 groups, 100,000 posts

| Table | Rows | Size per Row | Total Size |
|-------|------|--------------|------------|
| groups | 1,000 | ~500 bytes | ~500 KB |
| group_members | 10,000 | ~50 bytes | ~500 KB |
| group_join_requests | 5,000 | ~100 bytes | ~500 KB |
| posts (group posts) | 50,000 | ~1 KB | ~50 MB |

**Total Additional Storage:** ~52 MB (negligible)

---

## Rollback Plan

If needed, migrations can be rolled back in reverse order:

```sql
-- Rollback V010
ALTER TABLE posts DROP COLUMN is_system_post;
ALTER TABLE posts DROP COLUMN is_hidden;
ALTER TABLE posts DROP COLUMN group_id;

-- Rollback V009
DROP TABLE group_join_requests;

-- Rollback V008
DROP TABLE group_members;

-- Rollback V007
DROP TABLE groups;
```

---

## Security Considerations

### SQL Injection Prevention
- All queries will use parameterized statements (JPA/Hibernate)
- No raw SQL concatenation

### Access Control
- Application layer enforces role-based permissions
- Database constraints prevent invalid states
- Soft deletes (`is_active`) preserve audit trail

### Data Privacy
- Group posts deleted when group is deleted (CASCADE)
- User data removed when user is deleted (CASCADE)
- Join request history maintained for audit

---

## Next Steps After Review

1. ✅ **Review this document** - Verify all changes are correct
2. ⏳ **Approve migrations** - Confirm ready to apply
3. ⏳ **Apply migrations** - Run Liquibase when server starts
4. ⏳ **Create entities** - Java entities matching these tables
5. ⏳ **Create repositories** - JPA repositories for data access
6. ⏳ **Implement services** - Business logic layer
7. ⏳ **Create controllers** - REST API endpoints

---

## Questions to Consider

Before approving, please verify:

- ✅ Are the table names appropriate? (`groups`, `group_members`, `group_join_requests`)
- ✅ Are the column names clear and consistent?
- ✅ Is the role system correct? (owner → admin → member)
- ✅ Should we add any additional fields? (e.g., `group_category`, `member_count`)
- ✅ Are the indexes sufficient for expected queries?
- ✅ Should `is_private` groups have different join logic?
- ✅ Do we need a `group_settings` table for future extensibility?

**Please review and let me know if any changes are needed before we proceed!**
