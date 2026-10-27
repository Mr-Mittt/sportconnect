#!/bin/sh
# INFRA-12 sandbox: replace the committed dev secret of the realm client `sportconnect-credentials` (the backend's
# "confirm current password" and "set new password" client) with a random one. Idempotent. Runs INSIDE the Keycloak container:
#
#   { cat ~/.kc-admin-pw; echo; cat ~/.cred-secret; echo; } | docker exec -i sportconnect-dev-keycloak-1 \
#     sh -c "$(cat infra/oracle/scripts/set-credentials-client-secret.sh)"
#
# Line 1 of stdin: the Keycloak admin password. Line 2: the new client secret, which must equal
# KEYCLOAK_CREDENTIALS_CLIENT_SECRET in server.env. Not mirrored into sportconnect-realm.json (a production secret
# must never be in the file); INFRA-14 decides how a production realm gets it.
KC=/opt/keycloak/bin/kcadm.sh
read -r PW; read -r SEC
$KC config credentials --server http://localhost:8080 --realm master --user admin --password "$PW" >/dev/null || exit 1
ID=$($KC get clients -r sportconnect -q clientId=sportconnect-credentials --fields id --format csv --noquotes)
[ -n "$ID" ] || { echo "client sportconnect-credentials not found"; exit 1; }
$KC update clients/$ID -r sportconnect -s "secret=$SEC" && echo "secret update ok"
GOT=$($KC get clients/$ID/client-secret -r sportconnect --fields value --format csv --noquotes)
[ "$GOT" = "$SEC" ] && echo "read-back matches the new secret" || { echo "READ-BACK MISMATCH"; rm -f ~/.keycloak/kcadm.config; exit 1; }
rm -f ~/.keycloak/kcadm.config
