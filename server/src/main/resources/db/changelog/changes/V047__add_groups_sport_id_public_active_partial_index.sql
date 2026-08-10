-- B16: partial index for public-group search by sport.
-- V015 added groups.sport_id with no index at all. The real consumers
-- (GroupRepository.searchPublicGroupsWithCounts / searchPublicGroupsAnon) always filter
-- is_active = true AND is_private = false alongside sport_id — a partial index matching that
-- exact predicate (rather than a plain index over every row) keeps the index small and matches
-- the query shape precisely, same technique as idx_sessions_status_scheduled_start.

CREATE INDEX idx_groups_sport_id_public_active ON groups(sport_id)
    WHERE is_active = true AND is_private = false;
