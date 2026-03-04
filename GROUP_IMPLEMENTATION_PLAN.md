# Group Functionality - Implementation Plan

## Business Requirements

### Core Features
- **Groups (Clubs)**: Communities where members share thoughts and moments
- **Role-Based Access Control**: 3-tier system with specific permissions
- **Group Posts**: Posts associated with groups, with visibility control
- **Join Request Workflow**: Users request to join, admins approve/decline
- **System Posts**: Automatic posts for admin actions

### User Roles & Permissions

#### 1. Group Owner (one per group)
- All admin and member permissions
- **Exclusive permissions:**
  - Assign/remove `group_admin` role
  - Transfer `group_owner` role to another member
  - Delete group (optional)

#### 2. Group Admin (multiple per group)
- All member permissions
- **Additional permissions:**
  - Accept/decline join requests
  - Hide/unhide group posts
  - Remove members
  - Pin/unpin posts (optional)

#### 3. Group Member (all accepted users)
- Create/update/delete their own group posts
- Fetch all "unhide" group posts
- Like/comment on posts
- Leave group

### UI Navigation Structure

**Left Sidebar:**
1. **User's Space** - Personal feed + joined groups' posts
2. **Group Spaces** - Dynamic list of joined groups (by groupName)
3. **Join Group** - Modal to request joining via groupId
4. **Create Group** - Modal to create new group

**Feed Area:**
- Displays posts based on selected space
- User's space: Current user posts + all joined groups' posts
- Group space: Selected group's posts only

---

## Database Schema

### 1. Groups Table
```sql
CREATE TABLE groups (
    id BIGSERIAL PRIMARY KEY,
    group_name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    avatar_url VARCHAR(500),
    cover_url VARCHAR(500),
    is_private BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_groups_group_name ON groups(group_name);
CREATE INDEX idx_groups_created_by ON groups(created_by);
CREATE INDEX idx_groups_is_active ON groups(is_active);
```

### 2. Group Members Table
```sql
CREATE TABLE group_members (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('group_owner', 'group_admin', 'group_member')),
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(group_id, user_id)
);

CREATE INDEX idx_group_members_group_id ON group_members(group_id);
CREATE INDEX idx_group_members_user_id ON group_members(user_id);
CREATE INDEX idx_group_members_role ON group_members(role);
```

### 3. Group Join Requests Table
```sql
CREATE TABLE group_join_requests (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP,
    UNIQUE(group_id, user_id, status)
);

CREATE INDEX idx_group_join_requests_group_id ON group_join_requests(group_id);
CREATE INDEX idx_group_join_requests_user_id ON group_join_requests(user_id);
CREATE INDEX idx_group_join_requests_status ON group_join_requests(status);
```

### 4. Update Posts Table (add group_id)
```sql
ALTER TABLE posts ADD COLUMN group_id BIGINT REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE posts ADD COLUMN is_hidden BOOLEAN DEFAULT false;
ALTER TABLE posts ADD COLUMN is_system_post BOOLEAN DEFAULT false;

CREATE INDEX idx_posts_group_id ON posts(group_id);
CREATE INDEX idx_posts_is_hidden ON posts(is_hidden);
```

---

## Backend Implementation

### Module Structure
```
modules/
├── group/
│   ├── group-api/
│   │   ├── dto/
│   │   │   ├── GroupResponse.java
│   │   │   ├── CreateGroupRequest.java
│   │   │   ├── UpdateGroupRequest.java
│   │   │   ├── GroupMemberResponse.java
│   │   │   ├── JoinRequestResponse.java
│   │   │   └── CreateJoinRequestRequest.java
│   │   └── service/
│   │       └── GroupService.java
│   └── group-impl/
│       ├── entity/
│       │   ├── Group.java
│       │   ├── GroupMember.java
│       │   └── GroupJoinRequest.java
│       ├── repository/
│       │   ├── GroupRepository.java
│       │   ├── GroupMemberRepository.java
│       │   └── GroupJoinRequestRepository.java
│       ├── service/
│       │   └── GroupServiceImpl.java
│       └── controller/
│           └── GroupController.java
```

### Key Service Methods

**GroupService:**
```java
// Group CRUD
GroupResponse createGroup(UUID userId, CreateGroupRequest request);
GroupResponse getGroup(Long groupId, UUID currentUserId);
Page<GroupResponse> getUserGroups(UUID userId, Pageable pageable);
GroupResponse updateGroup(Long groupId, UUID userId, UpdateGroupRequest request);
void deleteGroup(Long groupId, UUID userId);

// Member Management
void addMember(Long groupId, UUID userId, UUID targetUserId, String role);
void removeMember(Long groupId, UUID userId, UUID targetUserId);
void updateMemberRole(Long groupId, UUID userId, UUID targetUserId, String newRole);
Page<GroupMemberResponse> getGroupMembers(Long groupId, UUID currentUserId, Pageable pageable);
void transferOwnership(Long groupId, UUID currentOwnerId, UUID newOwnerId);

// Join Requests
JoinRequestResponse createJoinRequest(UUID userId, CreateJoinRequestRequest request);
void acceptJoinRequest(Long requestId, UUID adminUserId);
void declineJoinRequest(Long requestId, UUID adminUserId);
Page<JoinRequestResponse> getGroupJoinRequests(Long groupId, UUID adminUserId, Pageable pageable);

// Permissions
boolean isGroupOwner(Long groupId, UUID userId);
boolean isGroupAdmin(Long groupId, UUID userId);
boolean isGroupMember(Long groupId, UUID userId);
boolean canManageMembers(Long groupId, UUID userId);
boolean canManagePosts(Long groupId, UUID userId);
```

### REST API Endpoints

```
POST   /api/groups                          - Create group
GET    /api/groups/{groupId}                - Get group details
GET    /api/groups/user/{userId}            - Get user's groups
PUT    /api/groups/{groupId}                - Update group
DELETE /api/groups/{groupId}                - Delete group

GET    /api/groups/{groupId}/members        - Get group members
POST   /api/groups/{groupId}/members        - Add member (admin only)
DELETE /api/groups/{groupId}/members/{userId} - Remove member
PUT    /api/groups/{groupId}/members/{userId}/role - Update member role

POST   /api/groups/join-requests            - Create join request
GET    /api/groups/{groupId}/join-requests  - Get pending requests (admin only)
PUT    /api/groups/join-requests/{requestId}/accept - Accept request
PUT    /api/groups/join-requests/{requestId}/decline - Decline request

GET    /api/posts/group/{groupId}           - Get group posts
POST   /api/posts/group/{groupId}           - Create group post
PUT    /api/posts/{postId}/hide             - Hide post (admin only)
PUT    /api/posts/{postId}/unhide           - Unhide post (admin only)
```

---

## Frontend Implementation

### Component Structure
```
client/src/
├── components/
│   ├── group/
│   │   ├── GroupSidebar.jsx           - Left navigation panel
│   │   ├── GroupSpaceItem.jsx         - Individual group item in sidebar
│   │   ├── CreateGroupModal.jsx       - Modal for creating group
│   │   ├── JoinGroupModal.jsx         - Modal for joining group
│   │   ├── GroupPostFeed.jsx          - Group-specific post feed
│   │   └── GroupMemberList.jsx        - List of group members
│   └── social/
│       └── SocialFeed.jsx (update)    - Add group filtering
├── pages/
│   └── FeedPage.jsx (update)          - Add sidebar integration
└── context/
    └── GroupContext.jsx               - Group state management
```

### UI Components

#### 1. GroupSidebar Component
```jsx
<div className="group-sidebar">
  {/* User's Space */}
  <div onClick={() => selectSpace('user')} className={active}>
    <User /> User's Space
  </div>
  
  {/* Group Spaces */}
  <div className="group-list">
    <h3>My Groups</h3>
    {userGroups.map(group => (
      <GroupSpaceItem 
        key={group.id}
        group={group}
        isActive={selectedGroupId === group.id}
        onClick={() => selectSpace('group', group.id)}
      />
    ))}
  </div>
  
  {/* Actions */}
  <button onClick={() => setShowJoinModal(true)}>
    <UserPlus /> Join Group
  </button>
  <button onClick={() => setShowCreateModal(true)}>
    <Plus /> Create Group
  </button>
</div>
```

#### 2. CreateGroupModal Component
```jsx
<Modal isOpen={isOpen} onClose={onClose}>
  <h2>Create New Group</h2>
  <form onSubmit={handleCreate}>
    <input
      type="text"
      placeholder="Group Name (unique)"
      value={groupName}
      onChange={(e) => setGroupName(e.target.value)}
      required
    />
    <textarea
      placeholder="Description (optional)"
      value={description}
      onChange={(e) => setDescription(e.target.value)}
    />
    <button type="submit">Create Group</button>
  </form>
</Modal>
```

#### 3. JoinGroupModal Component
```jsx
<Modal isOpen={isOpen} onClose={onClose}>
  <h2>Join Group</h2>
  <form onSubmit={handleJoinRequest}>
    <input
      type="text"
      placeholder="Enter Group Name"
      value={groupName}
      onChange={(e) => setGroupName(e.target.value)}
      required
    />
    <textarea
      placeholder="Message (optional)"
      value={message}
      onChange={(e) => setMessage(e.target.value)}
    />
    <button type="submit">Send Request</button>
  </form>
</Modal>
```

### Feed Logic

**User's Space:**
```javascript
// Fetch user's own posts + all posts from joined groups
const fetchUserSpacePosts = async () => {
  const response = await api.get(`/posts/user-space?userId=${userId}`);
  // Backend returns: user's posts + posts from all joined groups
};
```

**Group Space:**
```javascript
// Fetch posts from specific group
const fetchGroupPosts = async (groupId) => {
  const response = await api.get(`/posts/group/${groupId}?userId=${userId}`);
  // Backend returns: only posts from this group (unhidden)
};
```

---

## Implementation Phases

### Phase 1: Backend Foundation (Week 1)
1. Create database migration scripts
2. Create Group, GroupMember, GroupJoinRequest entities
3. Create repositories
4. Implement basic GroupService methods
5. Create REST API endpoints
6. Add group_id to Post entity

### Phase 2: Backend Business Logic (Week 1-2)
1. Implement role-based permission checks
2. Implement join request workflow
3. Implement member management
4. Update PostService to handle group posts
5. Implement system post creation for admin actions
6. Add unit tests

### Phase 3: Frontend UI (Week 2)
1. Create GroupSidebar component
2. Create CreateGroupModal and JoinGroupModal
3. Update FeedPage to include sidebar
4. Create GroupContext for state management
5. Style components with Tailwind CSS

### Phase 4: Frontend Integration (Week 2-3)
1. Integrate group API calls
2. Implement space switching logic
3. Update SocialFeed to filter by space/group
4. Add group post creation
5. Implement real-time updates (optional)

### Phase 5: Testing & Polish (Week 3)
1. End-to-end testing
2. Permission testing
3. UI/UX refinements
4. Error handling
5. Loading states

---

## Technical Considerations

### Security
- All group operations must verify user permissions
- Use `@PreAuthorize` annotations for role checks
- Validate group ownership before sensitive operations

### Performance
- Index foreign keys (group_id, user_id)
- Paginate member lists and post feeds
- Cache user group memberships
- Optimize N+1 queries with JOIN FETCH

### System Posts
- Create automatic posts for:
  - Member joined/removed
  - Role changes
  - Group settings updated
  - Post hidden/unhidden
- Format: "[role] userName has performed action"

### Future Enhancements
- Group invitations (invite-only groups)
- Group categories/tags
- Group search and discovery
- Group notifications
- Group analytics
- File/media sharing in groups
- Group events/calendar
