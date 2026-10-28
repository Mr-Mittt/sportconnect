#!/bin/bash
# INFRA-3: set the Keycloak master-realm admin password to one you type, then store it in ~/.kc-admin-pw (chmod 600) so the
# setup scripts can read it. Run ON THE BOX in a real terminal (it prompts, with hidden input):
#
#   ssh -t -i <key> ubuntu@<box-ip> ./set-admin-pw.sh
#
# Nothing is printed or put on a command line. Pasting is fine: the terminal's "bracketed paste" markers (ESC[200~ before
# and ESC[201~ after pasted text) are stripped. The first version of this script did not strip them, so a pasted password
# was stored with 12 invisible extra characters and the console rejected the real one (INFRA-3 rebuild log). Any other
# control character is refused, and the stored length is printed so a mismatch with what you meant to type is visible.
set -euo pipefail
umask 077

clean() {
  local v=$1
  v=${v//$'\e[200~'/}
  v=${v//$'\e[201~'/}
  printf '%s' "$v"
}

read -rsp "New Keycloak admin password (at least 12 characters): " P1; echo
read -rsp "Repeat it: " P2; echo
P1=$(clean "$P1"); P2=$(clean "$P2")
[ "$P1" = "$P2" ] || { echo "The two entries differ. Nothing changed."; exit 1; }
[ "${#P1}" -ge 12 ] || { echo "Shorter than 12 characters. Nothing changed."; exit 1; }
if printf '%s' "$P1" | LC_ALL=C grep -q '[[:cntrl:]]'; then
  echo "The password contains a control character (not a normal key press). Nothing changed."; exit 1
fi

CUR=$(tr -d '\n' < ~/.kc-admin-pw)
printf '%s\n%s\n' "$CUR" "$P1" | docker exec -i sportconnect-dev-keycloak-1 sh -c '
  read -r CUR; read -r NEW; K=/opt/keycloak/bin/kcadm.sh
  $K config credentials --server http://localhost:8080 --realm master --user admin --password "$CUR" >/dev/null &&
  $K set-password -r master --username admin --new-password "$NEW" &&
  $K config credentials --server http://localhost:8080 --realm master --user admin --password "$NEW" >/dev/null &&
  echo "changed, and verified by logging in with the new password"; rm -f ~/.keycloak/kcadm.config'
printf '%s\n' "$P1" > ~/.kc-admin-pw
chmod 600 ~/.kc-admin-pw
echo "stored in ~/.kc-admin-pw (${#P1} characters, this is the length you should see)"
