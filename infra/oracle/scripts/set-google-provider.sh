#!/bin/sh
# INFRA-14: replace the Google OAuth client id and secret of the realm's `google` identity provider, through the admin API
# (kcadm). Idempotent. Runs INSIDE the Keycloak container (`rotate-credentials.sh google` calls it); secrets only on stdin:
#
#   printf '%s\n%s\n%s\n' "$ADMIN_PW" "$CLIENT_ID" "$CLIENT_SECRET" | docker exec -i sportconnect-dev-keycloak-1 \
#     sh -c "$(cat infra/oracle/scripts/set-google-provider.sh)"
#
# Line 1 of stdin: the Keycloak admin password. Line 2: the Google client id. Line 3: the client secret.
# It changes config.clientId and config.clientSecret and nothing else of the provider, and it never creates the provider
# (that is infra/scripts/apply-realm-google-provider.sh): with no `google` provider it stops and changes nothing.
# Keycloak hides the secret, so the read-back shows the client id and `enabled` only. The exit status is the status of the
# update (the cleanup at the end must not hide a failure).
KC=/opt/keycloak/bin/kcadm.sh
read -r PW; read -r GID; read -r GSECRET
[ -n "$PW" ] && [ -n "$GID" ] && [ -n "$GSECRET" ] || { echo "empty admin password, client id or client secret on stdin: nothing changed"; exit 1; }
$KC config credentials --server http://localhost:8080 --realm master --user admin --password "$PW" >/dev/null || exit 1
rc=0
if ! $KC get identity-provider/instances/google -r sportconnect >/dev/null 2>&1; then
  echo "the realm has no google identity provider: nothing changed (create it with infra/scripts/apply-realm-google-provider.sh)"
  rc=1
elif $KC update identity-provider/instances/google -r sportconnect -s "config.clientId=$GID" -s "config.clientSecret=$GSECRET"; then
  echo "google provider update ok"
  $KC get identity-provider/instances/google -r sportconnect --fields 'alias,enabled,config(clientId)' || rc=1
  echo   # kcadm prints no newline after its JSON: keep the next message line apart
else
  rc=1
fi
rm -f ~/.keycloak/kcadm.config
exit $rc
