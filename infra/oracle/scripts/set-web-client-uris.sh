#!/bin/sh
# INFRA-12 sandbox: allow the production site (and only it) as the sign-in redirect for the realm client `sportconnect-web`.
# This REPLACES the localhost entries of the committed realm file, so a public realm does not accept redirects to
# localhost. Idempotent. Runs INSIDE the Keycloak container:
#
#   cat ~/.kc-admin-pw | docker exec -i -e PUBLIC_URL=https://yoursport.vn sportconnect-dev-keycloak-1 \
#     sh -c "$(cat infra/oracle/scripts/set-web-client-uris.sh)"
#
# Stdin: the Keycloak admin password. Not mirrored into sportconnect-realm.json (the production host is
# environment-specific); INFRA-14 decides how a production realm gets its redirect URIs.
KC=/opt/keycloak/bin/kcadm.sh
: "${PUBLIC_URL:?PUBLIC_URL is required, e.g. https://yoursport.vn (no trailing slash)}"
read -r PW
$KC config credentials --server http://localhost:8080 --realm master --user admin --password "$PW" >/dev/null || exit 1
ID=$($KC get clients -r sportconnect -q clientId=sportconnect-web --fields id --format csv --noquotes)
[ -n "$ID" ] || { echo "client sportconnect-web not found"; exit 1; }
$KC update clients/$ID -r sportconnect \
  -s "rootUrl=$PUBLIC_URL" \
  -s "redirectUris=[\"$PUBLIC_URL/*\"]" \
  -s "webOrigins=[\"$PUBLIC_URL\"]" \
  -s "attributes.\"post.logout.redirect.uris\"=$PUBLIC_URL/*" && echo "update ok"
# Read the whole client back: `--fields attributes` alone prints an empty object (a display filter only).
$KC get clients/$ID -r sportconnect | grep -E '"rootUrl"|"redirectUris"|"webOrigins"|pkce.code.challenge.method|post.logout.redirect.uris' -A1
rm -f ~/.keycloak/kcadm.config
