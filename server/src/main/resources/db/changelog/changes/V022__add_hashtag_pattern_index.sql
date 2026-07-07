-- V022: Add varchar_pattern_ops index on hashtags.tag for efficient LIKE 'prefix%' prefix search
CREATE INDEX idx_hashtags_tag_pattern ON hashtags(tag varchar_pattern_ops);
