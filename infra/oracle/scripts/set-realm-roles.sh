#!/bin/sh
# INFRA-25 (for A37): the realm roles the backend now reads from the access token (`realm_access.roles`), on the LIVE realm.
# Runs INSIDE the Keycloak container (apply-realm-production.sh does it for you):
#
#   cat ~/.kc-admin-pw | docker exec -i sportconnect-dev-keycloak-1 sh -c "$(cat infra/oracle/scripts/set-realm-roles.sh)"
#
# Stdin: the Keycloak admin password. Idempotent: a second run changes nothing and says so.
#   1. realm roles USER and ADMIN exist (ADMIN is created EMPTY: whoever is an admin is granted it by hand in the console);
#   2. USER is part of the realm default role `default-roles-sportconnect`, so every account (new and existing, since an
#      account holds the default role) has USER effectively and in its token;
#   3. backfill, the safety net: every real user whose EFFECTIVE realm roles lack USER (an account without the default role)
#      gets USER directly. Users are read 100 at a time; `service-account-*` users are skipped. A user that cannot be
#      updated is reported by id (never by email) and the script exits 1: nothing is silently skipped.
# Prints "users: N checked, A already had USER, B fixed, C failed".
KC=/opt/keycloak/bin/kcadm.sh
REALM=sportconnect
DEFAULT_ROLE="default-roles-$REALM"
PAGE=100

read -r PW
$KC config credentials --server http://localhost:8080 --realm master --user admin --password "$PW" >/dev/null || { echo "cannot log in to the master realm (admin password?)"; exit 1; }
trap 'rm -f ~/.keycloak/kcadm.config' EXIT

ensure_role() {
  if $KC get "roles/$1" -r "$REALM" >/dev/null 2>&1; then
    echo "role $1 exists"
  else
    $KC create roles -r "$REALM" -s "name=$1" -s "description=$2" >/dev/null || { echo "could not create the role $1"; exit 1; }
    echo "role $1 created"
  fi
}
ensure_role USER "Regular user; every account holds it through the realm default role (INFRA-25)"
ensure_role ADMIN "Platform administrator; granted by hand in the Keycloak console (INFRA-25)"

members=$($KC get-roles -r "$REALM" --rname "$DEFAULT_ROLE" --fields name --format csv --noquotes) || { echo "could not read the default role"; exit 1; }
if printf '%s\n' "$members" | grep -qx USER; then
  echo "USER is already in the realm default role"
else
  $KC add-roles -r "$REALM" --rname "$DEFAULT_ROLE" --rolename USER || { echo "could not add USER to the default role"; exit 1; }
  echo "USER added to the realm default role"
fi

first=0; checked=0; had=0; fixed=0; failed=0
while :; do
  page=$($KC get users -r "$REALM" -q "first=$first" -q "max=$PAGE" --fields id,username --format csv --noquotes) || { echo "could not list the users"; exit 1; }
  [ -n "$page" ] || break
  n=0
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    n=$((n + 1))
    uid=${line%%,*}
    case "${line#*,}" in service-account-*) continue ;; esac
    checked=$((checked + 1))
    if $KC get-roles -r "$REALM" --uid "$uid" --effective --fields name --format csv --noquotes | grep -qx USER; then
      had=$((had + 1))
    elif $KC add-roles -r "$REALM" --uid "$uid" --rolename USER; then
      fixed=$((fixed + 1))
    else
      failed=$((failed + 1)); echo "could not give USER to user id $uid"
    fi
  done <<EOF
$page
EOF
  [ "$n" -lt "$PAGE" ] && break
  first=$((first + PAGE))
done

echo "users: $checked checked, $had already had USER, $fixed fixed, $failed failed"
[ "$failed" -eq 0 ]
