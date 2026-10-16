// A28: the realm client behind Swagger UI's Authorize button (replaces the old /api/auth/oauth-token password bridge).
//
//   node infra/scripts/realm-swagger-client.mjs api    # apply to a running Keycloak through the admin API
//   node infra/scripts/realm-swagger-client.mjs file   # apply the same definition to sportconnect-realm.json
//
// One definition, two targets, so the live realm and the realm file cannot drift (the realm-change rule in CLAUDE.md:
// every realm change goes through the admin API AND is mirrored in sportconnect-realm.json). Both modes are idempotent.
// Run `api` through infra/scripts/apply-realm-swagger-client.sh.
//
// A public client with PKCE (Authorization Code), redirecting back to Swagger UI's oauth2-redirect page on the local
// backend, and carrying the `sportconnect-api` audience the resource server requires (A25). Nothing else: Swagger only
// needs the access token to call the API, and the user row is created by the web app's first sign-in (A26).
// Production serves Swagger from its own origin (INFRA-14): add that origin to redirectUris / webOrigins then, or leave
// the client out of the production realm.
//
// Overrides for `api`: KEYCLOAK_URL (default http://localhost:8081), KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD
// (default admin/admin, the dev-only bootstrap account), KEYCLOAK_REALM (default sportconnect).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CLIENT_ID = 'sportconnect-swagger';
const REALM_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../keycloak/realm/sportconnect-realm.json');

export const CLIENT = {
  clientId: CLIENT_ID,
  name: 'SportConnect Swagger UI (dev)',
  enabled: true,
  publicClient: true,
  protocol: 'openid-connect',
  standardFlowEnabled: true,
  implicitFlowEnabled: false,
  directAccessGrantsEnabled: false,
  serviceAccountsEnabled: false,
  rootUrl: 'http://localhost:8080',
  baseUrl: '/swagger-ui.html',
  redirectUris: ['http://localhost:8080/swagger-ui/oauth2-redirect.html'],
  webOrigins: ['http://localhost:8080'],
  attributes: { 'pkce.code.challenge.method': 'S256' },
  protocolMappers: [
    {
      name: 'sportconnect-api-audience',
      protocol: 'openid-connect',
      protocolMapper: 'oidc-audience-mapper',
      consentRequired: false,
      config: {
        'included.custom.audience': 'sportconnect-api',
        'id.token.claim': 'false',
        'access.token.claim': 'true',
        'introspection.token.claim': 'true',
        'lightweight.claim': 'false',
      },
    },
  ],
};

function applyToFile() {
  const raw = readFileSync(REALM_FILE, 'utf8');
  const realm = JSON.parse(raw);
  const index = realm.clients.findIndex((client) => client.clientId === CLIENT_ID);
  if (index >= 0) realm.clients[index] = CLIENT;
  else realm.clients.push(CLIENT);
  writeFileSync(REALM_FILE, JSON.stringify(realm, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
  console.log(`realm file: client ${CLIENT_ID} ${index >= 0 ? 'updated' : 'added'}`);
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
  const found = await (await fetch(`${url}/admin/realms/${realm}/clients?clientId=${CLIENT_ID}`, { headers })).json();
  if (found.length === 0) {
    const response = await fetch(`${url}/admin/realms/${realm}/clients`, { method: 'POST', headers, body: JSON.stringify(CLIENT) });
    if (!response.ok) throw new Error(`POST client -> ${response.status} ${await response.text()}`);
    console.log(`keycloak ${url} realm ${realm}: client ${CLIENT_ID} created`);
    return;
  }
  // The client exists: bring it to the definition. Its mappers are managed separately, so only the audience mapper is ensured.
  const id = found[0].id;
  const { protocolMappers, ...settings } = CLIENT;
  const response = await fetch(`${url}/admin/realms/${realm}/clients/${id}`, { method: 'PUT', headers, body: JSON.stringify({ ...found[0], ...settings }) });
  if (!response.ok) throw new Error(`PUT client -> ${response.status} ${await response.text()}`);
  const existing = await (await fetch(`${url}/admin/realms/${realm}/clients/${id}/protocol-mappers/models`, { headers })).json();
  for (const mapper of protocolMappers) {
    if (existing.some((m) => m.name === mapper.name)) continue;
    const added = await fetch(`${url}/admin/realms/${realm}/clients/${id}/protocol-mappers/models`, { method: 'POST', headers, body: JSON.stringify(mapper) });
    if (!added.ok) throw new Error(`POST mapper ${mapper.name} -> ${added.status} ${await added.text()}`);
  }
  console.log(`keycloak ${url} realm ${realm}: client ${CLIENT_ID} updated`);
}

const mode = process.argv[2];
if (mode === 'file') applyToFile();
else if (mode === 'api') await applyToKeycloak();
else {
  console.error('usage: node realm-swagger-client.mjs <api|file>');
  process.exit(2);
}
