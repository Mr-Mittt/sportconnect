// A32: the register page's country / region / location as Keycloak user-profile attributes, with token mappers.
//
//   node infra/scripts/registration-geo-attributes.mjs api    # apply to a running Keycloak through the admin API
//   node infra/scripts/registration-geo-attributes.mjs file   # apply the same definitions to sportconnect-realm.json
//
// One definition, two targets, so the live realm and the realm file cannot drift (the realm-change rule in CLAUDE.md:
// every realm change goes through the admin API AND is mirrored in sportconnect-realm.json). Both modes are idempotent.
// Run `api` through infra/scripts/apply-registration-geo-attributes.sh.
//
// Overrides for `api`: KEYCLOAK_URL (default http://localhost:8081), KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD
// (default admin/admin, the dev-only bootstrap account), KEYCLOAK_REALM (default sportconnect).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLIENT_ID = 'sportconnect-web';
const REALM_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../keycloak/realm/sportconnect-realm.json');
const PROFILE_PROVIDER = 'org.keycloak.userprofile.UserProfileProvider';

// Optional everywhere (a social user never sees the register page). Users may set them at registration; the backend
// reads them once, at the first sign-in (A32), and treats every value as untrusted input.
const attribute = (name, displayName, validations) => ({
  name,
  displayName,
  validations,
  permissions: { view: ['admin'], edit: ['admin', 'user'] },
  multivalued: false,
});

export const ATTRIBUTES = [
  attribute('countryId', 'Country', { integer: { min: 1 } }),
  attribute('regionId', 'Region', { integer: { min: 1 } }),
  attribute('latitude', 'Latitude', { double: { min: -90, max: 90 } }),
  attribute('longitude', 'Longitude', { double: { min: -180, max: 180 } }),
];

const mapper = (name, userAttribute, claimName) => ({
  name,
  protocol: 'openid-connect',
  protocolMapper: 'oidc-usermodel-attribute-mapper',
  consentRequired: false,
  config: {
    'user.attribute': userAttribute,
    'claim.name': claimName,
    'jsonType.label': 'String',
    'id.token.claim': 'true',
    'access.token.claim': 'true',
    'introspection.token.claim': 'true',
    'lightweight.claim': 'false',
  },
});

export const MAPPERS = [
  mapper('country-id', 'countryId', 'country_id'),
  mapper('region-id', 'regionId', 'region_id'),
  mapper('latitude', 'latitude', 'latitude'),
  mapper('longitude', 'longitude', 'longitude'),
];

/** The profile config with every missing attribute appended; returns the names it added. */
function withAttributes(profile) {
  const added = [];
  for (const wanted of ATTRIBUTES) {
    if (!profile.attributes.some((existing) => existing.name === wanted.name)) {
      profile.attributes.push(wanted);
      added.push(wanted.name);
    }
  }
  return added;
}

function applyToFile() {
  const raw = readFileSync(REALM_FILE, 'utf8');
  const realm = JSON.parse(raw);
  const component = realm.components[PROFILE_PROVIDER][0];
  const profile = JSON.parse(component.config['kc.user.profile.config'][0]);
  const addedAttributes = withAttributes(profile);
  component.config['kc.user.profile.config'][0] = JSON.stringify(profile);

  const client = realm.clients.find((c) => c.clientId === CLIENT_ID);
  const addedMappers = [];
  for (const wanted of MAPPERS) {
    if (!client.protocolMappers.some((existing) => existing.name === wanted.name)) {
      client.protocolMappers.push(wanted);
      addedMappers.push(wanted.name);
    }
  }
  writeFileSync(REALM_FILE, JSON.stringify(realm, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
  console.log(`realm file: attributes added [${addedAttributes}], mappers added [${addedMappers}]`);
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
  const call = async (path, init = {}) => {
    const response = await fetch(`${url}/admin/realms/${realm}${path}`, { ...init, headers });
    if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${response.status} ${await response.text()}`);
    return response;
  };

  const profile = await (await call('/users/profile')).json();
  const addedAttributes = withAttributes(profile);
  if (addedAttributes.length > 0) {
    await call('/users/profile', { method: 'PUT', body: JSON.stringify(profile) });
  }

  const [client] = await (await call(`/clients?clientId=${CLIENT_ID}`)).json();
  if (!client) throw new Error(`client ${CLIENT_ID} not found in realm ${realm}`);
  const existing = await (await call(`/clients/${client.id}/protocol-mappers/models`)).json();
  const addedMappers = [];
  for (const wanted of MAPPERS) {
    if (!existing.some((current) => current.name === wanted.name)) {
      await call(`/clients/${client.id}/protocol-mappers/models`, { method: 'POST', body: JSON.stringify(wanted) });
      addedMappers.push(wanted.name);
    }
  }
  console.log(`keycloak ${url} realm ${realm}: attributes added [${addedAttributes}], mappers added [${addedMappers}]`);
}

const mode = process.argv[2];
if (mode === 'file') applyToFile();
else if (mode === 'api') await applyToKeycloak();
else {
  console.error('usage: node registration-geo-attributes.mjs <api|file>');
  process.exit(2);
}
