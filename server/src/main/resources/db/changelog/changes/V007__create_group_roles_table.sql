-- Create group_roles table
-- Defines the available roles in groups with their permissions

CREATE TABLE group_roles (
    id SERIAL PRIMARY KEY,
    role_name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    level INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Insert default roles with hierarchy levels
-- Higher level = more permissions
INSERT INTO group_roles (role_name, description, level) VALUES
    ('group_owner', 'Group creator with full control. One per group. Can transfer ownership, assign admins, and perform all actions.', 3),
    ('group_admin', 'Group administrator with elevated permissions. Can manage members, moderate posts, and handle join requests.', 2),
    ('group_member', 'Regular group member. Can create posts, like, comment, and interact within the group.', 1);

-- Comments
COMMENT ON TABLE group_roles IS 'Defines available roles in groups with permission hierarchy';
COMMENT ON COLUMN group_roles.level IS 'Permission level: 3=owner, 2=admin, 1=member. Higher level inherits lower level permissions';
