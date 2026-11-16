-- SESSION-GL-64: the app's one user name search (first and last name, word-start, accent-insensitive).
--
-- unaccent drops accents ("Tuấn" -> "Tuan", "Đặng" -> "Dang"); pg_trgm lets one GIN index serve the three LIKE shapes the
-- search uses ('q%', '% q%', and any other leading-wildcard pattern), which a btree cannot do. Both are trusted extensions
-- since Postgres 13, so the database owner can create them (the dev postgis image ships them).
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent() is only STABLE, and an index expression must be IMMUTABLE. Pinning the dictionary by name makes the result
-- depend on nothing but the input, which is the usual and safe way to index it. The search query must call this exact
-- wrapper (and lower() around the column) or the planner will not use the indexes below.
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT public.unaccent('public.unaccent', $1) $$;

CREATE INDEX IF NOT EXISTS idx_users_first_name_search
    ON users USING gin (immutable_unaccent(lower(first_name)) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_last_name_search
    ON users USING gin (immutable_unaccent(lower(last_name)) gin_trgm_ops);
