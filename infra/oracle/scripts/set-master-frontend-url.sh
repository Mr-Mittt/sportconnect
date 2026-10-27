#!/bin/sh
# INFRA-12 sandbox: give the MASTER realm its own frontend URL, so the admin console works through an SSH tunnel while the
# public host keeps blocking /admin and /realms/master (Caddyfile). Without it the console asks the public host for
# /realms/master/protocol/openid-connect/3p-cookies/step1.html and gets 403 ("Something went wrong"). Idempotent.
# The `sportconnect` realm is NOT touched. Runs INSIDE the Keycloak container:
#
#   cat ~/.kc-admin-pw | docker exec -i -e ADMIN_URL=http://localhost:18081 sportconnect-dev-keycloak-1 \
#     sh -c "$(cat infra/oracle/scripts/set-master-frontend-url.sh)"
#
# Stdin: the Keycloak admin password. ADMIN_URL must equal KC_HOSTNAME_ADMIN in kc-prod.override.yml.
# Revert: kcadm.sh update realms/master -s attributes.frontendUrl=  (empty it).
# Side effect: admin tokens now carry the tunnel issuer, so admin scripts must log in through the tunnel or through
# kcadm inside the container, never through the public host. A token obtained BEFORE this change is rejected after it
# (a 401 right after the update is expected).
KC=/opt/keycloak/bin/kcadm.sh
: "${ADMIN_URL:?ADMIN_URL is required, e.g. http://localhost:18081}"
read -r PW
$KC config credentials --server http://localhost:8080 --realm master --user admin --password "$PW" >/dev/null || exit 1
$KC update realms/master -s "attributes.frontendUrl=$ADMIN_URL" && echo "master frontendUrl set to $ADMIN_URL"
rm -f ~/.keycloak/kcadm.config
echo "check: curl $ADMIN_URL/realms/master/.well-known/openid-configuration must show an issuer on $ADMIN_URL"
