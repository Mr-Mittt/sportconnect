#!/bin/sh
# INFRA-12 sandbox: point the realm's outgoing mail (Keycloak's reset, verification and account-link emails) at an SMTP relay,
# through the admin API (kcadm). Idempotent. Runs INSIDE the Keycloak container; secrets only on stdin, never in arguments:
#
#   { cat ~/.kc-admin-pw; echo; cat ~/.brevo-smtp-key; echo; } | docker exec -i \
#     -e SMTP_HOST=smtp-relay.brevo.com -e SMTP_PORT=587 -e SMTP_FROM=noreply@yoursport.vn \
#     -e SMTP_FROM_NAME=SportConnect -e SMTP_USER=<smtp login> \
#     sportconnect-dev-keycloak-1 sh -c "$(cat infra/oracle/scripts/set-smtp.sh)"
#
# Line 1 of stdin: the Keycloak admin password. Line 2: the SMTP key. The committed realm file keeps the dev Mailpit sink
# on purpose (mail settings are per environment); INFRA-11 should own turning this into a real per-environment step.
KC=/opt/keycloak/bin/kcadm.sh
: "${SMTP_HOST:?SMTP_HOST is required}" "${SMTP_PORT:?}" "${SMTP_FROM:?}" "${SMTP_USER:?}"
read -r PW; read -r SMTPKEY
$KC config credentials --server http://localhost:8080 --realm master --user admin --password "$PW" >/dev/null || exit 1
$KC update realms/sportconnect \
  -s "smtpServer.host=$SMTP_HOST" -s "smtpServer.port=$SMTP_PORT" \
  -s "smtpServer.from=$SMTP_FROM" -s "smtpServer.fromDisplayName=${SMTP_FROM_NAME:-SportConnect}" \
  -s smtpServer.auth=true -s "smtpServer.user=$SMTP_USER" -s "smtpServer.password=$SMTPKEY" \
  -s smtpServer.starttls=true -s smtpServer.ssl=false && echo "realm smtp update ok"
# The password is write-only: Keycloak hides it, so it is not part of this read-back.
$KC get realms/sportconnect --fields 'smtpServer(host,port,from,fromDisplayName,auth,user,starttls,ssl)'
rm -f ~/.keycloak/kcadm.config
