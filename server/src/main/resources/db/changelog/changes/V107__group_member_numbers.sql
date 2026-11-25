-- SESSION-81 (owner, 2026-11-25): a permanent number for every member of a group, unique inside the group and never reused,
-- so the statistics a group keeps about its members (the session module) can store a small number instead of a 36-character
-- user id. The number belongs to the (group, user) pair, not to the group_members row (that row is deleted when a member leaves,
-- and a member who rejoins gets the same number back).
--
-- group_member_numbers          one row per (group, user): the number
-- group_member_number_counters  the last number handed out in a group; allocating locks this row, so two allocations queue
--
-- No foreign keys (the group id and the user id are this module's and another module's). Existing members are numbered in
-- joined order; a member from before this migration is numbered here, a member added later is numbered the first time anything
-- asks for the number.

CREATE TABLE group_member_numbers (
    group_id BIGINT NOT NULL,
    user_id UUID NOT NULL,
    member_no INTEGER NOT NULL,
    PRIMARY KEY (group_id, user_id),
    CONSTRAINT unique_group_member_no UNIQUE (group_id, member_no)
);

CREATE TABLE group_member_number_counters (
    group_id BIGINT PRIMARY KEY,
    last_no INTEGER NOT NULL
);

INSERT INTO group_member_numbers (group_id, user_id, member_no)
SELECT group_id, user_id, CAST(ROW_NUMBER() OVER (PARTITION BY group_id ORDER BY joined_at, id) AS INTEGER)
FROM group_members;

INSERT INTO group_member_number_counters (group_id, last_no)
SELECT group_id, CAST(COUNT(*) AS INTEGER)
FROM group_members
GROUP BY group_id;
