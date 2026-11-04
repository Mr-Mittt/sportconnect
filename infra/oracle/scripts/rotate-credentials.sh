#!/usr/bin/env bash
# INFRA-14: replace the dev-grade credentials of the backing services on the production box. Run ON THE BOX as `ubuntu`.
#
#   rotate-credentials.sh postgres    least-privilege roles for the app, chat and Keycloak; new password for `postgres`
#   rotate-credentials.sh rabbitmq    the application user (AMQP and STOMP share it); removes `guest`
#   rotate-credentials.sh check       connects to Postgres as each role over the Docker network and asks RabbitMQ for the user
#   rotate-credentials.sh owners      read-only: per database, how many objects in `public` each role owns (run before and after to see what a run changed)
#
# Redis is not handled here: its password is set by the Compose override (`--requirepass`, REDIS_PASSWORD) and takes
# effect when Redis is recreated (guide section 18).
#
# Values come from the stack env file (default ~/web/stack.env, mode 600, see infra/oracle/stack.env.example). Passwords
# must be 16 to 128 characters of [A-Za-z0-9_-] (`openssl rand -hex 24` gives one): they are placed in SQL and shell text
# on stdin, so anything else is refused. No password appears on a command line of this script; Postgres can still write
# a statement into its server log when that statement fails, and `rabbitmqctl` shows the password in its own argument
# list inside the container for the moment it runs.
#
# What `postgres` does, per database (sportconnect_dev -> sc_app, sportconnect_chat_dev -> sc_chat, keycloak_dev -> sc_keycloak):
#   creates the role, or sets its password and LOGIN; creates the extensions the app's first migration asks for (a role that is not
#   a superuser cannot create `postgis`, and `CREATE EXTENSION IF NOT EXISTS` skips an existing one); makes the role the owner
#   of the database and of every table, view, sequence, routine and type in `public` that the extensions do not own; revokes
#   CONNECT from PUBLIC so one service's role cannot open another service's database. Running it again changes nothing.
# `postgres` stays a superuser for backups, which reach it through the container's local socket (no password asked there).
#
# Settings: STACK_ENV, PG_CONTAINER (sportconnect-dev-postgres-1), RMQ_CONTAINER (sportconnect-dev-rabbitmq-1),
#           NET (sportconnect-dev_default), PG_CLIENT_IMAGE (ghcr.io/mr-mittt/sportconnect-postgis:16-3.6, already on the box).
#
# Written for INFRA-14. Rehearsed on a restored copy of the real data (2026-11-03), then run on the live A1 box (`postgres`, `rabbitmq`, `check` all ok).
set -uo pipefail

STACK_ENV="${STACK_ENV:-${ENV_DIR:-$HOME/web}/stack.env}"
PG="${PG_CONTAINER:-sportconnect-dev-postgres-1}"
RMQ="${RMQ_CONTAINER:-sportconnect-dev-rabbitmq-1}"
NET="${NET:-sportconnect-dev_default}"
PG_CLIENT_IMAGE="${PG_CLIENT_IMAGE:-ghcr.io/mr-mittt/sportconnect-postgis:16-3.6}"

# database role password-variable
PAIRS=("sportconnect_dev sc_app SC_APP_DB_PASSWORD" "sportconnect_chat_dev sc_chat SC_CHAT_DB_PASSWORD" "keycloak_dev sc_keycloak KC_DB_PASSWORD")

die() { echo "rotate-credentials: $*" >&2; exit 1; }

[ -f "$STACK_ENV" ] || die "$STACK_ENV not found (copy infra/oracle/stack.env.example, fill it in, chmod 600)"
case "$(stat -c %a "$STACK_ENV")" in 600|400) ;; *) die "$STACK_ENV must be mode 600" ;; esac

# val <name>: the value of NAME= in the stack env file (the file is read, never sourced)
val() { grep -m1 "^$1=" "$STACK_ENV" | cut -d= -f2-; }
need_pw() {
  local v; v="$(val "$1")"
  [ -n "$v" ] || die "$1 is missing in $STACK_ENV"
  printf '%s' "$v" | grep -Eq '^[A-Za-z0-9_-]{16,128}$' || die "$1 must be 16 to 128 characters of A-Z a-z 0-9 _ - (openssl rand -hex 24)"
  printf '%s' "$v"
}
psql_admin() { docker exec -i "$PG" psql -v ON_ERROR_STOP=1 -q -U postgres "$@"; }

do_postgres() {
  local pair db role var pw
  need_pw POSTGRES_PASSWORD > /dev/null
  for pair in "${PAIRS[@]}"; do read -r _ _ var <<< "$pair"; need_pw "$var" > /dev/null; done

  echo "== postgres superuser password"
  printf "ALTER ROLE postgres PASSWORD '%s';\n" "$(need_pw POSTGRES_PASSWORD)" | psql_admin -d postgres || die "cannot set the postgres password"

  for pair in "${PAIRS[@]}"; do
    read -r db role var <<< "$pair"
    pw="$(need_pw "$var")"
    echo "== $db -> $role"
    psql_admin -d postgres <<SQL || die "role or ownership step failed for $db"
DO \$do\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$role') THEN
    CREATE ROLE $role LOGIN PASSWORD '$pw';
  ELSE
    ALTER ROLE $role LOGIN PASSWORD '$pw';
  END IF;
END \$do\$;
ALTER DATABASE $db OWNER TO $role;
REVOKE ALL ON DATABASE $db FROM PUBLIC;
GRANT CONNECT ON DATABASE $db TO $role;
SQL
    psql_admin -d "$db" <<SQL || die "object ownership step failed in $db"
$( [ "$db" = sportconnect_dev ] && printf 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";\nCREATE EXTENSION IF NOT EXISTS "postgis";\n' )
DO \$do\$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS obj, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND pg_get_userbyid(c.relowner) = 'postgres' AND c.relkind IN ('r','p','v','m','f','S')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype IN ('e','a','i'))
  LOOP
    EXECUTE format('ALTER %s %s OWNER TO %I',
      CASE r.relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' WHEN 'f' THEN 'FOREIGN TABLE' ELSE 'TABLE' END,
      r.obj, '$role');
  END LOOP;
  FOR r IN
    SELECT p.oid::regprocedure AS obj FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND pg_get_userbyid(p.proowner) = 'postgres' AND p.prokind IN ('f','p')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER ROUTINE %s OWNER TO %I', r.obj, '$role');
  END LOOP;
  FOR r IN
    SELECT t.oid::regtype AS obj FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND pg_get_userbyid(t.typowner) = 'postgres' AND t.typtype IN ('e','d')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = t.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER TYPE %s OWNER TO %I', r.obj, '$role');
  END LOOP;
END \$do\$;
SQL
  done
  echo "== postgres done. Next: put the same role passwords in server.env, chat.env and the Keycloak settings, then recreate the services (guide section 18)."
}

do_rabbitmq() {
  local user pw
  user="$(val RABBITMQ_USERNAME)"
  printf '%s' "$user" | grep -Eq '^[a-z][a-z0-9_]{2,31}$' || die "RABBITMQ_USERNAME must be 3 to 32 characters of a-z 0-9 _ , starting with a letter"
  [ "$user" != guest ] || die "RABBITMQ_USERNAME must not be guest"
  pw="$(need_pw RABBITMQ_PASSWORD)"
  echo "== rabbitmq user $user"
  # the password goes in on stdin; the script inside the container runs rabbitmqctl with it
  printf '%s' "$pw" | docker exec -i -e RU="$user" "$RMQ" sh -c '
    read -r P
    if rabbitmqctl -q list_users | cut -f1 | grep -qx "$RU"; then rabbitmqctl -q change_password "$RU" "$P"; else rabbitmqctl -q add_user "$RU" "$P"; fi &&
    rabbitmqctl -q set_user_tags "$RU" &&
    rabbitmqctl -q set_permissions -p / "$RU" ".*" ".*" ".*" &&
    if rabbitmqctl -q list_users | cut -f1 | grep -qx guest; then rabbitmqctl -q delete_user guest; fi' || die "rabbitmqctl failed"
  echo "== rabbitmq done. Next: RABBITMQ_USERNAME / RABBITMQ_PASSWORD in server.env, then recreate the server (guide section 18)."
}

# pg_login <role> <password-var> <database>: connect over the Docker network (the container's own 127.0.0.1 is trusted)
pg_login() {
  val "$2" | docker run --rm -i --network "$NET" -e PGUSER="$1" -e PGDATABASE="$3" -e PGHOST=postgres --entrypoint sh "$PG_CLIENT_IMAGE" \
    -c 'read -r PGPASSWORD; export PGPASSWORD; psql -tA -c "SELECT current_user"' 2>&1
}
do_check() {
  local pair db role var out ok=0 other
  for pair in "${PAIRS[@]}"; do
    read -r db role var <<< "$pair"
    out="$(pg_login "$role" "$var" "$db")"
    if [ "$out" = "$role" ]; then echo "ok    $role connects to $db"; else echo "FAIL  $role on $db: $out"; ok=1; fi
    for other in sportconnect_dev sportconnect_chat_dev keycloak_dev; do
      [ "$other" = "$db" ] && continue
      out="$(pg_login "$role" "$var" "$other")"
      if [ "$out" = "$role" ]; then echo "FAIL  $role can also open $other"; ok=1; else echo "ok    $role is refused on $other"; fi
    done
  done
  out="$(docker exec "$RMQ" rabbitmqctl -q list_users 2>&1 | cut -f1 | tr '\n' ' ')"
  echo "rabbitmq users: $out"
  case " $out " in *" guest "*) echo "FAIL  guest still exists"; ok=1 ;; esac
  case " $out " in *" $(val RABBITMQ_USERNAME) "*) ;; *) echo "FAIL  $(val RABBITMQ_USERNAME) is missing"; ok=1 ;; esac
  [ "$ok" = 0 ] && echo "== all checks passed" || echo "== SOME CHECKS FAILED"
  return "$ok"
}

# owners: object counts per kind and owner, plus the database owner. Read-only; no names, no data.
do_owners() {
  local pair db
  for pair in "${PAIRS[@]}"; do
    read -r db _ <<< "$pair"
    echo "== $db"
    psql_admin -d "$db" -tA -F " " <<SQL || die "owners query failed for $db"
SELECT 'relation:' || c.relkind::text, pg_get_userbyid(c.relowner), count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' GROUP BY 1, 2
UNION ALL SELECT 'routine', pg_get_userbyid(p.proowner), count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' GROUP BY 1, 2
UNION ALL SELECT 'enum', pg_get_userbyid(t.typowner), count(*) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype = 'e' GROUP BY 1, 2
UNION ALL SELECT 'database', pg_get_userbyid(datdba), 1 FROM pg_database WHERE datname = current_database()
ORDER BY 1, 2;
SQL
  done
}

case "${1:-}" in
  postgres) do_postgres ;;
  rabbitmq) do_rabbitmq ;;
  check) do_check ;;
  owners) do_owners ;;
  *) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
