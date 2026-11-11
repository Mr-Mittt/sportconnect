-- SESSION-46: how serious the game is, 1 (for fun) to 10 (competitive). Existing rows and
-- auto-generated recurring sessions get 5.
ALTER TABLE sessions ADD COLUMN game_mood INTEGER NOT NULL DEFAULT 5;
ALTER TABLE sessions ADD CONSTRAINT chk_sessions_game_mood CHECK (game_mood BETWEEN 1 AND 10);
