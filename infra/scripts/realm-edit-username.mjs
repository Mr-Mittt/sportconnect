// U26: lets the backend change a user's Keycloak username (`editUsernameAllowed: true`).
//
//   node infra/scripts/realm-edit-username.mjs api    # apply to a running Keycloak through the admin API
//   node infra/scripts/realm-edit-username.mjs file   # apply the same value to sportconnect-realm.json
//
// One definition, two targets, so the live realm and the realm file cannot drift (the realm-change rule in CLAUDE.md:
// every realm change goes through the admin API AND is mirrored in sportconnect-realm.json). Both modes are idempotent.
// Run `api` through infra/scripts/apply-realm-edit-username.sh.
//
// Why: a password account registered with an email has that email as its Keycloak username (A27). When the user changes
// the email (U26) the username must follow, or the old address would keep signing in as a username and nobody else could
// register it. With `editUsernameAllowed: false` Keycloak refuses that update even for the admin API
// (`error-user-attribute-read-only`, checked live 2026-10-20). Nothing else changes: the account console that would let a
// user edit their own username is not used, and the login and registration pages never offer it.
//
// Overrides for `api`: KEYCLOAK_URL (default http://localhost:8081), KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD
// (default admin/admin, the dev-only bootstrap account), KEYCLOAK_REALM (default sportconnect).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EDIT_USERNAME_ALLOWED = true;
const REALM_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../keycloak/realm/sportconnect-realm.json');

function applyToFile() {
  const raw = readFileSync(REALM_FILE, 'utf8');
  const realm = JSON.parse(raw);
  realm.editUsernameAllowed = EDIT_USERNAME_ALLOWED;
  writeFileSync(REALM_FILE, JSON.stringify(realm, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
  console.log(`realm file: editUsernameAllowed ${EDIT_USERNAME_ALLOWED}`);
}

async function applyToKeycloak() {
  const url = process.env.KEYCLOAK_URL ?? 'http://localhost:8081';
  const realm = process.env.KEYCLOAK_REALM ?? 'sportconnect';
  const tokenResponse = await fetch(`${url}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: process.env.KEYCLOAK_ADMIN ?? 'admin',
      password: process.env.KEYCLOAK_ADMIN_PASSWORD ?? 'admin',
    }),
  });
  if (!tokenResponse.ok) throw new Error(`admin login failed: ${tokenResponse.status}`);
  const token = (await tokenResponse.json()).access_token;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const current = await (await fetch(`${url}/admin/realms/${realm}`, { headers })).json();
  const response = await fetch(`${url}/admin/realms/${realm}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ editUsernameAllowed: EDIT_USERNAME_ALLOWED }),
  });
  if (!response.ok) throw new Error(`PUT realm -> ${response.status} ${await response.text()}`);
  const after = await (await fetch(`${url}/admin/realms/${realm}`, { headers })).json();
  if (after.editUsernameAllowed !== EDIT_USERNAME_ALLOWED) throw new Error('editUsernameAllowed did not take effect');
  console.log(`keycloak ${url} realm ${realm}: editUsernameAllowed ${current.editUsernameAllowed} -> ${after.editUsernameAllowed}`);
}

const mode = process.argv[2];
if (mode === 'file') applyToFile();
else if (mode === 'api') await applyToKeycloak();
else {
  console.error('usage: node realm-edit-username.mjs <api|file>');
  process.exit(2);
}
