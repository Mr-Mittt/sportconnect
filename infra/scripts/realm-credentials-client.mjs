// U24: the realm client behind "confirm my current password" and "set my new password" (the backend keeps no password).
//
//   node infra/scripts/realm-credentials-client.mjs api    # apply to a running Keycloak through the admin API
//   node infra/scripts/realm-credentials-client.mjs file   # apply the same definition to sportconnect-realm.json
//
// One definition, two targets, so the live realm and the realm file cannot drift (the realm-change rule in CLAUDE.md:
// every realm change goes through the admin API AND is mirrored in sportconnect-realm.json). Both modes are idempotent.
// Run `api` through infra/scripts/apply-realm-credentials-client.sh.
//
// A confidential, backend-only client: no browser flow at all (standardFlowEnabled false), two capabilities and nothing else:
//   - the password grant (directAccessGrantsEnabled), which the backend uses to ask "is this the user's password?" and whose
//     tokens it throws away; and
//   - a service account whose only roles are realm-management manage-users and view-users, which the backend uses to read a
//     user's username and to set a new password (the admin reset-password call).
// Both run server to server with the client secret, so no user-facing page or SPA can use them.
//
// The secret: KEYCLOAK_CREDENTIALS_CLIENT_SECRET (default `dev-credentials-client-secret`, the dev-only value in
// application.yml, like admin/admin). The realm file carries that dev value too, so a fresh dev import works; PRODUCTION MUST
// RUN `api` with a real secret (and give the backend the same one): INFRA-14.
//
// Overrides for `api`: KEYCLOAK_URL (default http://localhost:8081), KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD
// (default admin/admin, the dev-only bootstrap account), KEYCLOAK_REALM (default sportconnect).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CLIENT_ID = 'sportconnect-credentials';
export const DEV_SECRET = 'dev-credentials-client-secret';
export const SERVICE_ACCOUNT_ROLES = ['manage-users', 'view-users'];
const REALM_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../keycloak/realm/sportconnect-realm.json');

export function clientDefinition(secret) {
  return {
    clientId: CLIENT_ID,
    name: 'SportConnect backend credentials (password check and set)',
    description: 'U24. Backend only: password grant to confirm a current password, service account to set a new one.',
    enabled: true,
    publicClient: false,
    protocol: 'openid-connect',
    clientAuthenticatorType: 'client-secret',
    secret,
    standardFlowEnabled: false,
    implicitFlowEnabled: false,
    directAccessGrantsEnabled: true,
    serviceAccountsEnabled: true,
    redirectUris: [],
    webOrigins: [],
  };
}

function serviceAccountUser() {
  return {
    username: `service-account-${CLIENT_ID}`,
    enabled: true,
    serviceAccountClientId: CLIENT_ID,
    clientRoles: { 'realm-management': SERVICE_ACCOUNT_ROLES },
  };
}

function applyToFile() {
  const raw = readFileSync(REALM_FILE, 'utf8');
  const realm = JSON.parse(raw);
  const client = clientDefinition(DEV_SECRET);
  const index = realm.clients.findIndex((c) => c.clientId === CLIENT_ID);
  if (index >= 0) realm.clients[index] = client;
  else realm.clients.push(client);
  // An import creates the service-account user from this entry and gives it its roles; the file holds no other user.
  realm.users = realm.users ?? [];
  const userIndex = realm.users.findIndex((u) => u.serviceAccountClientId === CLIENT_ID);
  if (userIndex >= 0) realm.users[userIndex] = serviceAccountUser();
  else realm.users.push(serviceAccountUser());
  writeFileSync(REALM_FILE, JSON.stringify(realm, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
  console.log(`realm file: client ${CLIENT_ID} ${index >= 0 ? 'updated' : 'added'} with its service-account user`);
}

async function applyToKeycloak() {
  const url = process.env.KEYCLOAK_URL ?? 'http://localhost:8081';
  const realm = process.env.KEYCLOAK_REALM ?? 'sportconnect';
  const secret = process.env.KEYCLOAK_CREDENTIALS_CLIENT_SECRET ?? DEV_SECRET;
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
  const admin = `${url}/admin/realms/${realm}`;

  const found = await (await fetch(`${admin}/clients?clientId=${CLIENT_ID}`, { headers })).json();
  let id;
  if (found.length === 0) {
    const response = await fetch(`${admin}/clients`, { method: 'POST', headers, body: JSON.stringify(clientDefinition(secret)) });
    if (!response.ok) throw new Error(`POST client -> ${response.status} ${await response.text()}`);
    id = (await (await fetch(`${admin}/clients?clientId=${CLIENT_ID}`, { headers })).json())[0].id;
    console.log(`keycloak ${url} realm ${realm}: client ${CLIENT_ID} created`);
  } else {
    id = found[0].id;
    const response = await fetch(`${admin}/clients/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ ...found[0], ...clientDefinition(secret) }),
    });
    if (!response.ok) throw new Error(`PUT client -> ${response.status} ${await response.text()}`);
    console.log(`keycloak ${url} realm ${realm}: client ${CLIENT_ID} updated`);
  }

  // The service account gets exactly manage-users and view-users on realm-management (adding what is missing).
  const management = (await (await fetch(`${admin}/clients?clientId=realm-management`, { headers })).json())[0];
  const serviceUser = await (await fetch(`${admin}/clients/${id}/service-account-user`, { headers })).json();
  const roles = [];
  for (const name of SERVICE_ACCOUNT_ROLES) {
    const role = await (await fetch(`${admin}/clients/${management.id}/roles/${name}`, { headers })).json();
    roles.push({ id: role.id, name: role.name });
  }
  const mapped = await (await fetch(`${admin}/users/${serviceUser.id}/role-mappings/clients/${management.id}`, { headers })).json();
  const missing = roles.filter((role) => !mapped.some((m) => m.name === role.name));
  if (missing.length > 0) {
    const response = await fetch(`${admin}/users/${serviceUser.id}/role-mappings/clients/${management.id}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(missing),
    });
    if (!response.ok) throw new Error(`POST role mappings -> ${response.status} ${await response.text()}`);
  }
  console.log(`keycloak ${url} realm ${realm}: service account has ${SERVICE_ACCOUNT_ROLES.join(', ')}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  if (mode === 'file') applyToFile();
  else if (mode === 'api') await applyToKeycloak();
  else {
    console.error('usage: node realm-credentials-client.mjs <api|file>');
    process.exit(2);
  }
}
