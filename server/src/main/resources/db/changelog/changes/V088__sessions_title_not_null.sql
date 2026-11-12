-- SESSION-49: the title is required again. Backfill the rows that have none (a group-generated session never
-- had one; a manual create could omit it) with a title that keeps them distinguishable, then enforce it.
UPDATE sessions SET title = 'Session #' || id WHERE title IS NULL OR btrim(title) = '';
ALTER TABLE sessions ALTER COLUMN title SET NOT NULL;
