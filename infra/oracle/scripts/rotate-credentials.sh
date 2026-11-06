#!/usr/bin/env bash
# INFRA-14: replace the dev-grade credentials of the backing services on the production box. Run ON THE BOX as `ubuntu`.
#
#   rotate-credentials.sh postgres    least-privilege roles for the app, chat and Keycloak; new password for `postgres`
#   rotate-credentials.sh rabbitmq    the application user (AMQP and STOMP share it); removes `guest`
#   rotate-credentials.sh check       connects to Postgres as each role over the Docker network and asks RabbitMQ for the user
#   rotate-credentials.sh owners      read-only: per database, how many objects in `public` each role owns (run before and after to see what a run changed)
#   rotate-credentials.sh smtp        the Brevo SMTP login and key of server.env: tested against Brevo first, then set on the realm
#   rotate-credentials.sh keycloak-admin   the Keycloak admin password: the new one is $ENV_DIR/kc-admin-pw; asks for the old one if needed
#   rotate-credentials.sh google      the Google OAuth client id:secret in $ENV_DIR/google-oauth: tested against Google first, then set on the realm
#   rotate-credentials.sh ghcr        the GHCR token: fetch-secrets.sh logs in with the Vault item, then the images are read and the expiry is printed
#   rotate-credentials.sh all         postgres, rabbitmq, smtp, keycloak-admin, google, ghcr in this order, stopping at the first failure; each one
#                                     applies the value now in the Vault (new or not), so put any new value there first
#
# smtp, keycloak-admin, google and ghcr work on the finished files of fetch-secrets.sh (ENV_DIR: server.env, kc-admin-pw, google-oauth) and
# on the live realm through kcadm inside the Keycloak container (secrets on stdin, as apply-realm-production.sh does); each one tests the
# new value at its source first and, when that test fails, aborts and changes nothing. None of them writes to the Vault: the box's policy is
# read-only, so the owner puts the new value there (a new secret version in the console) before the command runs.
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
# Settings: ENV_DIR (where the files are; default ~/web), SERVER_ENV, ADMIN_PW_FILE, GOOGLE_FILE, KC_CONTAINER (sportconnect-dev-keycloak-1),
#           AUTH_URL (https://auth.yoursport.vn), SCRIPTS (the directory of this file), STACK_ENV, PG_CONTAINER (sportconnect-dev-postgres-1), RMQ_CONTAINER (sportconnect-dev-rabbitmq-1),
#           NET (sportconnect-dev_default), PG_CLIENT_IMAGE (ghcr.io/mr-mittt/sportconnect-postgis:16-3.6, already on the box).
#
# Test hooks (not used on the box): GOOGLE_TOKEN_URL, GITHUB_API_URL, SMTP_CHECK_PLAIN=1 (no STARTTLS), KC_OLD_ADMIN_PW_FILE (the old admin
# password from a file instead of the prompt), GHCR_CHECK_IMAGE, ROTATE_SELF (what `all` runs for each step).
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

ENVD="${ENV_DIR:-$HOME/web}"
SERVER_ENV="${SERVER_ENV:-$ENVD/server.env}"
ADMIN_PW_FILE="${ADMIN_PW_FILE:-$ENVD/kc-admin-pw}"
GOOGLE_FILE="${GOOGLE_FILE:-$ENVD/google-oauth}"
KC_CONTAINER="${KC_CONTAINER:-sportconnect-dev-keycloak-1}"
AUTH_URL="${AUTH_URL:-https://auth.yoursport.vn}"
SCRIPTS="${SCRIPTS:-$(cd "$(dirname "$0")" && pwd)}"

# the stack env file is needed by the subcommands that handle the backing services only
need_stack() {
  [ -f "$STACK_ENV" ] || die "$STACK_ENV not found (copy infra/oracle/stack.env.example, fill it in, chmod 600)"
  case "$(stat -c %a "$STACK_ENV")" in 600|400) ;; *) die "$STACK_ENV must be mode 600" ;; esac
}

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

# ---- INFRA-14 follow-up: the credentials the realm and the outside services hold ----

need_file() { [ -f "$1" ] || die "$1 not found ($2)"; }
admin_pw() { tr -d '\r\n' < "$ADMIN_PW_FILE"; }
sval() { grep -m1 "^$1=" "$SERVER_ENV" | cut -d= -f2-; }
# A value placed inside a curl config file (read from stdin, so it never shows in a process list): backslash and double quote
# escaped; a control character is refused (a newline would end the line of the config file).
cfg_val() {
  if printf '%s' "$1" | LC_ALL=C grep -q '[[:cntrl:]]'; then die "a value contains a control character"; fi
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}
# in_kc <script file> [docker exec options]: runs the script inside the Keycloak container; stdin of this function is the script's stdin
in_kc() { local f="$1"; shift; docker exec -i "$@" "$KC_CONTAINER" sh -c "$(tr -d '\r' < "$f")"; }
# kc_login <password>: 0 when the master realm admin can log in with it (nothing is left behind in the container)
kc_login() {
  printf '%s\n' "$1" | docker exec -i "$KC_CONTAINER" sh -c '
    read -r P; /opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user admin --password "$P" >/dev/null 2>&1
    rc=$?; rm -f ~/.keycloak/kcadm.config; exit $rc'
}

do_google() {
  need_file "$GOOGLE_FILE" "fetch-secrets.sh writes it from the Vault item google-oauth: <client id>:<client secret>"
  need_file "$ADMIN_PW_FILE" "fetch-secrets.sh writes it"
  local item gid gsec resp err
  item="$(tr -d '\r\n' < "$GOOGLE_FILE")"
  case "$item" in *:*) gid="${item%%:*}"; gsec="${item#*:}" ;; *) die "$GOOGLE_FILE must hold <client id>:<client secret> on one line" ;; esac
  [ -n "$gid" ] && [ -n "$gsec" ] || die "$GOOGLE_FILE has an empty client id or secret"
  echo "== google: testing the client id and secret at Google (a dummy authorization code; nobody is signed in)"
  # A right id and secret get `invalid_grant` (the code is a dummy); a wrong one gets `invalid_client`.
  resp="$({
    printf 'url = "%s"\nrequest = "POST"\n' "$(cfg_val "${GOOGLE_TOKEN_URL:-https://oauth2.googleapis.com/token}")"
    printf 'data-urlencode = "client_id=%s"\n' "$(cfg_val "$gid")"
    printf 'data-urlencode = "client_secret=%s"\n' "$(cfg_val "$gsec")"
    printf 'data-urlencode = "code=rotation-check"\ndata-urlencode = "grant_type=authorization_code"\n'
    printf 'data-urlencode = "redirect_uri=%s"\n' "$(cfg_val "$AUTH_URL/realms/sportconnect/broker/google/endpoint")"
  } | curl -sS -m 20 -K - 2>&1)"
  err="$(printf '%s' "$resp" | sed -n 's/.*"error" *: *"\([^"]*\)".*/\1/p' | head -n1)"
  case "$err" in
    invalid_grant) echo "ok    Google accepts the client id and secret" ;;
    invalid_client) die "Google refuses the client id or secret (invalid_client); nothing was changed" ;;
    "") die "no usable answer from Google (network, or an unexpected reply); nothing was changed" ;;
    *) die "Google answered '$err', which is neither 'invalid_grant' nor 'invalid_client'; nothing was changed" ;;
  esac
  echo "== google: setting them on the realm's google identity provider"
  printf '%s\n%s\n%s\n' "$(admin_pw)" "$gid" "$gsec" | in_kc "$SCRIPTS/set-google-provider.sh" || die "the realm step failed"
  echo "== google done. Next: sign in with Google once (a private window). If the secret in the Vault is a NEW one, then disable the OLD client secret in Google Cloud Console (APIs & Services, Credentials, the OAuth client); if you re-ran the same secret there is nothing to disable."
}

do_smtp() {
  need_file "$SERVER_ENV" "fetch-secrets.sh writes it"
  need_file "$ADMIN_PW_FILE" "fetch-secrets.sh writes it"
  local v host port user pw tls=(--ssl-reqd) err
  for v in MAIL_HOST MAIL_PORT MAIL_USERNAME MAIL_PASSWORD EMAIL_FROM; do [ -n "$(sval $v)" ] || die "$v is empty in $SERVER_ENV"; done
  host="$(sval MAIL_HOST)"; port="$(sval MAIL_PORT)"; user="$(sval MAIL_USERNAME)"; pw="$(sval MAIL_PASSWORD)"
  [ -z "${SMTP_CHECK_PLAIN:-}" ] || tls=()
  echo "== smtp: testing the login at $host:$port (STARTTLS and AUTH only; no mail is sent)"
  # curl logs in and runs NOOP; a refused login ends with "Login denied" and a non-zero status
  if err="$(printf 'user = "%s:%s"\n' "$(cfg_val "$user")" "$(cfg_val "$pw")" | curl -sS -m 20 ${tls[@]+"${tls[@]}"} --url "smtp://$host:$port" -K - -X NOOP 2>&1 >/dev/null)"; then
    echo "ok    the SMTP server accepts the login"
  else
    echo "FAIL  the SMTP login was refused or could not be tested: $err" >&2
    die "nothing was changed"
  fi
  echo "== smtp: setting the realm's mail server"
  printf '%s\n%s\n' "$(admin_pw)" "$pw" | in_kc "$SCRIPTS/set-smtp.sh" \
    -e "SMTP_HOST=$host" -e "SMTP_PORT=$port" -e "SMTP_FROM=$(sval EMAIL_FROM)" -e "SMTP_USER=$user" || die "the realm step failed"
  echo "== smtp done. Next: the backend sends the welcome mail with the same login, so recreate the server: sportconnect-deploy --recreate=server --yes. Then send a password-reset mail to prove it."
}

do_keycloak_admin() {
  need_file "$ADMIN_PW_FILE" "fetch-secrets.sh writes it from the Vault item kc-admin-pw"
  local new old
  new="$(admin_pw)"
  [ "${#new}" -ge 12 ] || die "the new admin password in $ADMIN_PW_FILE is shorter than 12 characters"
  if kc_login "$new"; then echo "== keycloak-admin: the password in $ADMIN_PW_FILE already logs in; nothing to change"; return 0; fi
  echo "== keycloak-admin: the new password does not log in yet; the old one is needed to change it"
  if [ -n "${KC_OLD_ADMIN_PW_FILE:-}" ]; then old="$(tr -d '\r\n' < "$KC_OLD_ADMIN_PW_FILE")"
  else
    [ -t 0 ] || die "the old admin password is asked for in a terminal (run this in an ssh session with a tty)"
    read -rsp "Old Keycloak admin password: " old; echo
    old=${old//$'\e[200~'/}; old=${old//$'\e[201~'/}   # the markers a terminal adds around pasted text
  fi
  kc_login "$old" || die "the old password does not log in either; nothing was changed"
  printf '%s\n%s\n' "$old" "$new" | docker exec -i "$KC_CONTAINER" sh -c '
    read -r CUR; read -r NEW; K=/opt/keycloak/bin/kcadm.sh
    $K config credentials --server http://localhost:8080 --realm master --user admin --password "$CUR" >/dev/null &&
    $K set-password -r master --username admin --new-password "$NEW"
    rc=$?; rm -f ~/.keycloak/kcadm.config; exit $rc' || die "the password change failed"
  kc_login "$new" || die "the change ran, but the new password does not log in"
  echo "== keycloak-admin done: changed, and verified by logging in with the new password (the Vault item is the only copy; no file is written)"
}

do_ghcr() {
  local fs out digest cfg auth up token hdr
  fs="$SCRIPTS/fetch-secrets.sh"
  need_file "$fs" "it sits next to this script"
  echo "== ghcr: fetch-secrets.sh (logs in with the Vault item ghcr-token)"
  out="$(bash "$fs" 2>&1 >/dev/null)" || die "fetch-secrets.sh failed: $out"
  case "$out" in *"docker login ghcr.io ok"*) echo "ok    docker login ghcr.io" ;; *) die "the GHCR login did not happen: $out" ;; esac
  digest="$(docker buildx imagetools inspect "${GHCR_CHECK_IMAGE:-ghcr.io/mr-mittt/sportconnect-box:prod}" --format '{{.Manifest.Digest}}' 2>&1)" \
    || die "the login is ok but the image cannot be read: $digest"
  echo "ok    the box image can be read ($(printf '%s' "$digest" | cut -c1-19))"
  cfg="${DOCKER_CONFIG:-$HOME/.docker}/config.json"
  auth=""
  [ -f "$cfg" ] && auth="$(tr -d '\n\r\t ' < "$cfg" | sed -n 's/.*"ghcr.io":{"auth":"\([^"]*\)".*/\1/p')"
  up="$(printf '%s' "$auth" | base64 -d 2>/dev/null || true)"
  token="${up#*:}"
  if [ -z "$up" ] || [ "$token" = "$up" ]; then
    echo "info  the token cannot be read from $cfg (a credential store?), so its expiry is not printed: read it on GitHub"; return 0
  fi
  hdr="$({ printf 'header = "Authorization: Bearer %s"\n' "$(cfg_val "$token")"
           printf 'url = "%s"\n' "$(cfg_val "${GITHUB_API_URL:-https://api.github.com}/user")"; } | curl -sS -m 20 -I -K - 2>/dev/null | tr -d '\r')"
  echo "info  token expiry: $(printf '%s' "$hdr" | sed -n 's/^[Gg]ithub-authentication-token-expiration: *//p' | head -n1)"
  echo "info  token scopes: $(printf '%s' "$hdr" | sed -n 's/^[Xx]-[Oo][Aa]uth-[Ss]copes: *//p' | head -n1)"
  echo "== ghcr done. Write the expiry date in infra/oracle/SECRETS.md (an empty expiry above: the header was not sent, read it on GitHub)."
}

do_all() {
  local step self="${ROTATE_SELF:-$0}"
  # keycloak-admin can ask for the old password in a terminal, so it comes before the two steps that never ask
  for step in postgres rabbitmq smtp keycloak-admin google ghcr; do
    echo "##### rotate-credentials.sh $step"
    bash "$self" "$step" || die "the step '$step' failed; the steps after it were not run"
  done
  echo "##### all six steps ran. Still yours: start-stack.sh (recreates the services on new database, RabbitMQ or Redis passwords), sportconnect-deploy --recreate=server,chat --yes"
  echo "##### (after a new database, RabbitMQ or mail value), a Google sign-in and, after a NEW Google secret, disabling the old one in Google Cloud Console."
}

case "${1:-}" in
  postgres) need_stack; do_postgres ;;
  rabbitmq) need_stack; do_rabbitmq ;;
  check) need_stack; do_check ;;
  owners) need_stack; do_owners ;;
  smtp) do_smtp ;;
  keycloak-admin) do_keycloak_admin ;;
  google) do_google ;;
  ghcr) do_ghcr ;;
  all) do_all ;;
  *) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
