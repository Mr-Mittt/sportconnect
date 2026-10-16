// A28: the realm's email theme and the lifetime of the password-reset link.
//
//   node infra/scripts/realm-email-theme.mjs api    # apply to a running Keycloak through the admin API
//   node infra/scripts/realm-email-theme.mjs file   # apply the same values to sportconnect-realm.json
//
// One definition, two targets, so the live realm and the realm file cannot drift (the realm-change rule in CLAUDE.md:
// every realm change goes through the admin API AND is mirrored in sportconnect-realm.json). Both modes are idempotent.
// Run `api` through infra/scripts/apply-realm-email-theme.sh.
//
// The theme itself is the directory infra/keycloak/themes/sportconnect/email (en and vi, mounted into the dev
// Keycloak); the SMTP settings were already in the realm file (INFRA-13). The reset link keeps the old app's
// one-hour life (`app.password-reset.expiration-minutes`, A10); Keycloak's default is five minutes. The
// verify-email link is left at the default: turning verification on, and its lifetime, are A33's.
//
// Overrides for `api`: KEYCLOAK_URL (default http://localhost:8081), KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD
// (default admin/admin, the dev-only bootstrap account), KEYCLOAK_REALM (default sportconnect).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EMAIL_THEME = 'sportconnect';
export const REALM_ATTRIBUTES = { 'actionTokenGeneratedByUserLifespan.reset-credentials': '3600' };
const REALM_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../keycloak/realm/sportconnect-realm.json');

function applyToFile() {
  const raw = readFileSync(REALM_FILE, 'utf8');
  const realm = JSON.parse(raw);
  realm.emailTheme = EMAIL_THEME;
  realm.attributes = { ...(realm.attributes ?? {}), ...REALM_ATTRIBUTES };
  writeFileSync(REALM_FILE, JSON.stringify(realm, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
  console.log(`realm file: emailTheme ${EMAIL_THEME}, attributes ${JSON.stringify(REALM_ATTRIBUTES)}`);
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
  // A partial representation updates only the fields it names; `attributes` is sent whole (merged with what is there)
  // because Keycloak replaces the attribute map it is given.
  const attributes = { ...(current.attributes ?? {}), ...REALM_ATTRIBUTES };
  const response = await fetch(`${url}/admin/realms/${realm}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ emailTheme: EMAIL_THEME, attributes }),
  });
  if (!response.ok) throw new Error(`PUT realm -> ${response.status} ${await response.text()}`);
  console.log(`keycloak ${url} realm ${realm}: emailTheme ${JSON.stringify(current.emailTheme)} -> ${EMAIL_THEME}, attributes ${JSON.stringify(REALM_ATTRIBUTES)}`);
}

const mode = process.argv[2];
if (mode === 'file') applyToFile();
else if (mode === 'api') await applyToKeycloak();
else {
  console.error('usage: node realm-email-theme.mjs <api|file>');
  process.exit(2);
}
