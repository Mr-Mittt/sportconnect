// The realm's password policy (the old app's rule: at least 8 characters, RegisterRequest @Size(min = 8)).
//
//   node infra/scripts/realm-password-policy.mjs api    # apply to a running Keycloak through the admin API
//   node infra/scripts/realm-password-policy.mjs file   # apply the same value to sportconnect-realm.json
//
// One definition, two targets, so the live realm and the realm file cannot drift (the realm-change rule in CLAUDE.md:
// every realm change goes through the admin API AND is mirrored in sportconnect-realm.json). Both modes are idempotent.
// Run `api` through infra/scripts/apply-realm-password-policy.sh.
//
// Keycloak evaluates a policy only when a password is created or changed (register, reset, update password, admin
// reset); a login never re-checks it, so an existing shorter password keeps working until it is next changed.
//
// Overrides for `api`: KEYCLOAK_URL (default http://localhost:8081), KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD
// (default admin/admin, the dev-only bootstrap account), KEYCLOAK_REALM (default sportconnect).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PASSWORD_POLICY = 'length(8)';
const REALM_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../keycloak/realm/sportconnect-realm.json');

function applyToFile() {
  const raw = readFileSync(REALM_FILE, 'utf8');
  const realm = JSON.parse(raw);
  const before = realm.passwordPolicy;
  realm.passwordPolicy = PASSWORD_POLICY;
  writeFileSync(REALM_FILE, JSON.stringify(realm, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
  console.log(`realm file: passwordPolicy ${JSON.stringify(before)} -> ${JSON.stringify(PASSWORD_POLICY)}`);
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
  if (current.passwordPolicy !== PASSWORD_POLICY) {
    // A partial representation updates only the fields it names.
    const response = await fetch(`${url}/admin/realms/${realm}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ passwordPolicy: PASSWORD_POLICY }),
    });
    if (!response.ok) throw new Error(`PUT realm -> ${response.status} ${await response.text()}`);
  }
  console.log(`keycloak ${url} realm ${realm}: passwordPolicy ${JSON.stringify(current.passwordPolicy)} -> ${JSON.stringify(PASSWORD_POLICY)}`);
}

const mode = process.argv[2];
if (mode === 'file') applyToFile();
else if (mode === 'api') await applyToKeycloak();
else {
  console.error('usage: node realm-password-policy.mjs <api|file>');
  process.exit(2);
}
