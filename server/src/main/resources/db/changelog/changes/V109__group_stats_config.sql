-- SESSION-83 (owner, 2026-11-27): a group's own settings of the statistics it counts for its member row and its board, keyed by
-- stat ({"sessions": {"enabled": false, "when": ["joined"]}}). NULL (the default) means the sport's config. Added as a nullable
-- column with no default, so PostgreSQL does not rewrite the table and the previous server image's entity ignores it.
ALTER TABLE group_session_settings ADD COLUMN stats_config JSONB;
