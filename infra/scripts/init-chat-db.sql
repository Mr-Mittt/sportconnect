-- Seeds the chat service's own dev database on the same Postgres container the monolith
-- already uses — mirrors production (one RDS instance, one database per service, not one
-- Postgres server per service). Mounted into docker-entrypoint-initdb.d in
-- infra/docker-compose.dev.yml, so it only runs the first time the Postgres data volume is
-- created. Existing dev environments need one manual
-- `CREATE DATABASE sportconnect_chat_dev;` (via psql or a volume reset) — see
-- services/chat/CLAUDE.md.
CREATE DATABASE sportconnect_chat_dev;
