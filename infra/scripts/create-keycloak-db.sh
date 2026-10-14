#!/bin/sh
# Creates the database Keycloak stores its schema in (INFRA-13). Keycloak creates its own
# tables on first start but never the database or the role, so something has to provide an
# empty database first. Idempotent: running it again changes nothing.
#
# Three ways it runs, all the same file:
#   1. Fresh dev volume - mounted into docker-entrypoint-initdb.d by infra/docker-compose.dev.yml,
#      so Postgres runs it when it creates the data volume (after `docker compose down -v`).
#   2. Existing dev volume - run it once by hand:
#        docker compose -f infra/docker-compose.dev.yml exec -T postgres \
#          sh /docker-entrypoint-initdb.d/10-create-keycloak-db.sh
#   3. Production (INFRA-14) - run once by the deploy against the production Postgres, with
#      PGHOST/PGUSER/PGPASSWORD of an admin and KEYCLOAK_DB_USER/KEYCLOAK_DB_PASSWORD set so
#      Keycloak gets its own least-privilege role instead of the superuser.
#
# Environment (all optional):
#   KEYCLOAK_DB_NAME      database to create          (default keycloak_dev)
#   KEYCLOAK_DB_USER      role that owns it; unset = the connecting admin owns it (dev)
#   KEYCLOAK_DB_PASSWORD  password for that role; required when KEYCLOAK_DB_USER is set
#   PGHOST PGPORT PGUSER PGPASSWORD  the usual libpq settings for the admin connection
#
# initdb.d may source this file instead of executing it, so it must not call `exit`.

create_keycloak_db() {
  db="${KEYCLOAK_DB_NAME:-keycloak_dev}"
  owner="${KEYCLOAK_DB_USER:-}"
  admin="${PGUSER:-${POSTGRES_USER:-postgres}}"

  if [ -n "$owner" ]; then
    if [ -z "${KEYCLOAK_DB_PASSWORD:-}" ]; then
      echo "create-keycloak-db: KEYCLOAK_DB_PASSWORD is required when KEYCLOAK_DB_USER is set" >&2
      return 1
    fi
    psql -v ON_ERROR_STOP=1 -U "$admin" -d postgres \
      -v owner="$owner" -v password="$KEYCLOAK_DB_PASSWORD" <<'SQL' || return 1
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'owner', :'password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'owner')
\gexec
SQL
  else
    owner="$admin"
  fi

  psql -v ON_ERROR_STOP=1 -U "$admin" -d postgres -v db="$db" -v owner="$owner" <<'SQL' || return 1
SELECT format('CREATE DATABASE %I OWNER %I', :'db', :'owner')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db')
\gexec
SQL
  echo "create-keycloak-db: database '$db' is ready (owner '$owner')"
}

create_keycloak_db
