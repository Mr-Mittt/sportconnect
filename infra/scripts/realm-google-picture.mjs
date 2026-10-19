// A36: the Google profile picture on its way to the backend, which may use it as the avatar on the first Google sign-in.
//
//   node infra/scripts/realm-google-picture.mjs api    # apply to a running Keycloak through the admin API
//   node infra/scripts/realm-google-picture.mjs file   # apply the same definitions to sportconnect-realm.json
//
// Three pieces, one definition for both targets (the realm-change rule in CLAUDE.md), both modes idempotent:
//   - a user-profile attribute `picture` that only an admin can edit (a user cannot put a URL there from the account console);
//   - an identity-provider mapper on `google` that copies the provider's `picture` claim into that attribute. It is
//     FORCE-synced because the first Google sign-in of an EXISTING account is a link, not an import: a plain import
//     mapper would not run for it. The backend, not Keycloak, decides when the picture is used (once per user, A36);
//   - a token mapper on the client `sportconnect-web` that puts the attribute in the access token as `picture`, which
//     is what the backend callback reads.
// The backend treats the claim as untrusted (https, a Google image host, 500 characters at most).
//
// Run `api` through infra/scripts/apply-realm-google-picture.sh. Overrides for `api`: KEYCLOAK_URL (default
// http://localhost:8081), KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD (default admin/admin), KEYCLOAK_REALM (default sportconnect).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ALIAS = 'google';
export const CLIENT_ID = 'sportconnect-web';
export const ATTRIBUTE_NAME = 'picture';
export const IDP_MAPPER_NAME = 'google-picture';
export const TOKEN_MAPPER_NAME = 'picture';
const REALM_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../keycloak/realm/sportconnect-realm.json');
const PROFILE_PROVIDER = 'org.keycloak.userprofile.UserProfileProvider';

export const ATTRIBUTE = {
  name: ATTRIBUTE_NAME,
  displayName: 'Picture',
  validations: { length: { max: 500 } },
  permissions: { view: ['admin'], edit: ['admin'] },
  multivalued: false,
};

/** The provider mapper; `alias` is `google`, or a stub provider's alias in the live check. */
export const idpMapper = (alias) => ({
  name: IDP_MAPPER_NAME,
  identityProviderAlias: alias,
  identityProviderMapper: 'oidc-user-attribute-idp-mapper',
  config: { syncMode: 'FORCE', claim: 'picture', 'user.attribute': ATTRIBUTE_NAME },
});

export const TOKEN_MAPPER = {
  name: TOKEN_MAPPER_NAME,
  protocol: 'openid-connect',
  protocolMapper: 'oidc-usermodel-attribute-mapper',
  consentRequired: false,
  config: {
    'user.attribute': ATTRIBUTE_NAME,
    'claim.name': 'picture',
    'jsonType.label': 'String',
    'id.token.claim': 'false',
    'access.token.claim': 'true',
    'introspection.token.claim': 'true',
    'lightweight.claim': 'false',
  },
};

function applyToFile() {
  const raw = readFileSync(REALM_FILE, 'utf8');
  const realm = JSON.parse(raw);
  const component = realm.components[PROFILE_PROVIDER][0];
  const profile = JSON.parse(component.config['kc.user.profile.config'][0]);
  const addedAttribute = !profile.attributes.some((a) => a.name === ATTRIBUTE_NAME);
  if (addedAttribute) profile.attributes.push(ATTRIBUTE);
  component.config['kc.user.profile.config'][0] = JSON.stringify(profile);

  realm.identityProviderMappers ??= [];
  const addedIdpMapper = !realm.identityProviderMappers.some((m) => m.identityProviderAlias === ALIAS && m.name === IDP_MAPPER_NAME);
  if (addedIdpMapper) realm.identityProviderMappers.push(idpMapper(ALIAS));

  const client = realm.clients.find((c) => c.clientId === CLIENT_ID);
  const addedTokenMapper = !client.protocolMappers.some((m) => m.name === TOKEN_MAPPER_NAME);
  if (addedTokenMapper) client.protocolMappers.push(TOKEN_MAPPER);

  writeFileSync(REALM_FILE, JSON.stringify(realm, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
  console.log(`realm file: attribute added ${addedAttribute}, provider mapper added ${addedIdpMapper}, token mapper added ${addedTokenMapper}`);
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
  const addedAttribute = !profile.attributes.some((a) => a.name === ATTRIBUTE_NAME);
  if (addedAttribute) {
    profile.attributes.push(ATTRIBUTE);
    await call('/users/profile', { method: 'PUT', body: JSON.stringify(profile) });
  }

  const [client] = await (await call(`/clients?clientId=${CLIENT_ID}`)).json();
  if (!client) throw new Error(`client ${CLIENT_ID} not found in realm ${realm}`);
  const tokenMappers = await (await call(`/clients/${client.id}/protocol-mappers/models`)).json();
  const addedTokenMapper = !tokenMappers.some((m) => m.name === TOKEN_MAPPER_NAME);
  if (addedTokenMapper) {
    await call(`/clients/${client.id}/protocol-mappers/models`, { method: 'POST', body: JSON.stringify(TOKEN_MAPPER) });
  }

  // The provider mapper needs the provider itself (created by apply-realm-google-provider.sh from the Google OAuth client).
  let addedIdpMapper = false;
  const provider = await fetch(`${url}/admin/realms/${realm}/identity-provider/instances/${ALIAS}`, { headers });
  if (provider.ok) {
    const mappers = await (await call(`/identity-provider/instances/${ALIAS}/mappers`)).json();
    addedIdpMapper = !mappers.some((m) => m.name === IDP_MAPPER_NAME);
    if (addedIdpMapper) {
      await call(`/identity-provider/instances/${ALIAS}/mappers`, { method: 'POST', body: JSON.stringify(idpMapper(ALIAS)) });
    }
  } else {
    console.log(`provider ${ALIAS} does not exist here yet: run apply-realm-google-provider.sh, then this script again for its mapper`);
  }
  console.log(`keycloak ${url} realm ${realm}: attribute added ${addedAttribute}, token mapper added ${addedTokenMapper}, provider mapper added ${addedIdpMapper}`);
}

const mode = process.argv[2];
if (process.argv[1]?.endsWith('realm-google-picture.mjs')) {
  if (mode === 'file') applyToFile();
  else if (mode === 'api') await applyToKeycloak();
  else {
    console.error('usage: node realm-google-picture.mjs <api|file>');
    process.exit(2);
  }
}
