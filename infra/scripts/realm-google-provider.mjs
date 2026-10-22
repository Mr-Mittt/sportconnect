// A29: the Google identity provider of the sportconnect realm.
//
//   node infra/scripts/realm-google-provider.mjs api    # create/update it in a running Keycloak (needs the Google OAuth client)
//   node infra/scripts/realm-google-provider.mjs file   # write the secret-free, disabled copy into sportconnect-realm.json
//
// The Google OAuth client comes from the environment (GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET) or from the JSON that
// Google Cloud Console lets you download, saved as infra/keycloak/providers/client_secret_*.json (git-ignored). With
// neither, `api` changes nothing and says so: the provider is only configured when the owner's client exists.
//
// What `api` sets (idempotent):
//   - provider `google` (Keycloak's built-in Google provider), scopes `openid email profile`, enabled;
//   - `trustEmail: false` ON PURPOSE: Keycloak then still proves ownership of an existing account (emailed link or
//     password) before linking Google to it. `true` would link silently, which lets a pre-registered, unverified
//     account be taken over (A29 ticket, "Never a silent link");
//   - the emailed link-your-account link lives 30 minutes (realm attribute actionTokenGeneratedByUserLifespan.idp-verify-account-via-email, set even when no Google client exists yet);
//   - NO `firstBrokerLoginFlowAlias`: the provider uses the realm's first-broker-login binding, the A35 flow
//     `sportconnect first broker login` (finds an existing account by the normalized email).
// `file` mirrors the same provider into the realm file with placeholder credentials and `enabled: false` (the file holds
// no secret; `api` fills the real client in and enables it).
//
// Overrides: KEYCLOAK_URL (default http://localhost:8081), KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD (default
// admin/admin, the dev-only bootstrap account), KEYCLOAK_REALM (default sportconnect).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REALM_FILE = resolve(HERE, '../keycloak/realm/sportconnect-realm.json');
const PROVIDERS_DIR = resolve(HERE, '../keycloak/providers');

export const ALIAS = 'google';
export const PLACEHOLDER = 'set-by-realm-google-provider-api';
// The emailed "link your Google sign-in" link (Keycloak's default is 5 minutes, too short to open a mailbox and come back).
export const LINK_LIFESPAN_KEY = 'actionTokenGeneratedByUserLifespan.idp-verify-account-via-email';
export const LINK_LIFESPAN_SECONDS = '1800';

/** Where the redirect URI to register at Google comes from: <keycloak>/realms/<realm>/broker/google/endpoint. */
export const redirectUri = (base, realm) => `${base}/realms/${realm}/broker/${ALIAS}/endpoint`;

/** The provider as Keycloak stores it; `client` null gives the secret-free placeholder copy for the realm file. */
export function googleProvider(client) {
  return {
    alias: ALIAS,
    displayName: 'Google',
    providerId: 'google',
    enabled: client !== null,
    trustEmail: false,
    storeToken: false,
    addReadTokenRoleOnCreate: false,
    authenticateByDefault: false,
    linkOnly: false,
    config: {
      clientId: client?.clientId ?? PLACEHOLDER,
      clientSecret: client?.clientSecret ?? PLACEHOLDER,
      defaultScope: 'openid email profile',
      syncMode: 'IMPORT',
      useJwksUrl: 'true',
    },
  };
}

/** The owner's Google OAuth client: env first, then the downloaded client_secret_*.json; null when there is none. */
export function readGoogleClient(env = process.env, dir = PROVIDERS_DIR) {
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, source: 'environment' };
  }
  if (!existsSync(dir)) return null;
  const name = readdirSync(dir).find((f) => /^client_secret_.*\.json$/.test(f));
  if (!name) return null;
  const parsed = JSON.parse(readFileSync(join(dir, name), 'utf8'));
  const web = parsed.web ?? parsed.installed;
  if (!web?.client_id || !web?.client_secret) throw new Error(`${name} has no client_id / client_secret`);
  return { clientId: web.client_id, clientSecret: web.client_secret, source: name, redirectUris: web.redirect_uris ?? [] };
}

async function login() {
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
    if (!response.ok && response.status !== 404) {
      throw new Error(`${init.method ?? 'GET'} ${path} -> ${response.status} ${await response.text()}`);
    }
    return response;
  };
  return { url, realm, call };
}

async function applyToKeycloak() {
  const { url, realm, call } = await login();
  const current = await (await call('')).json();
  if (current.attributes?.[LINK_LIFESPAN_KEY] !== LINK_LIFESPAN_SECONDS) {
    await call('', {
      method: 'PUT',
      body: JSON.stringify({ attributes: { ...current.attributes, [LINK_LIFESPAN_KEY]: LINK_LIFESPAN_SECONDS } }),
    });
    console.log(`keycloak ${url} realm ${realm}: link email lifetime set to ${LINK_LIFESPAN_SECONDS} s`);
  }
  const client = readGoogleClient();
  if (client === null) {
    console.log('no Google OAuth client (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET or infra/keycloak/providers/client_secret_*.json): provider not configured');
    return;
  }
  const wanted = googleProvider(client);
  const existing = await call(`/identity-provider/instances/${ALIAS}`);
  if (existing.status === 404) {
    await call('/identity-provider/instances', { method: 'POST', body: JSON.stringify(wanted) });
    console.log(`keycloak ${url} realm ${realm}: provider ${ALIAS} created from ${client.source}`);
  } else {
    const current = await existing.json();
    // keep anything an admin tuned (mappers are separate); the managed fields are overwritten
    const merged = { ...current, ...wanted, config: { ...current.config, ...wanted.config } };
    delete merged.firstBrokerLoginFlowAlias;
    if (current.firstBrokerLoginFlowAlias && current.firstBrokerLoginFlowAlias !== 'sportconnect first broker login') {
      merged.firstBrokerLoginFlowAlias = 'sportconnect first broker login';
    }
    await call(`/identity-provider/instances/${ALIAS}`, { method: 'PUT', body: JSON.stringify(merged) });
    console.log(`keycloak ${url} realm ${realm}: provider ${ALIAS} updated from ${client.source}`);
  }
  console.log(`register this redirect URI at Google: ${redirectUri(url, realm)}`);
  if (client.redirectUris && !client.redirectUris.includes(redirectUri(url, realm))) {
    console.log(`  NOT in the downloaded client file yet (it lists ${client.redirectUris.join(', ') || 'none'}): add it in Google Cloud Console`);
  }
}

function applyToFile() {
  const raw = readFileSync(REALM_FILE, 'utf8');
  const file = JSON.parse(raw);
  const others = (file.identityProviders ?? []).filter((p) => p.alias !== ALIAS);
  file.identityProviders = [...others, googleProvider(null)];
  file.attributes = { ...file.attributes, [LINK_LIFESPAN_KEY]: LINK_LIFESPAN_SECONDS };
  writeFileSync(REALM_FILE, JSON.stringify(file, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
  console.log(`realm file: identityProviders [${file.identityProviders.map((p) => p.alias)}] (${ALIAS} disabled, no secret)`);
}

const mode = process.argv[2];
if (process.argv[1]?.endsWith('realm-google-provider.mjs')) {
  if (mode === 'api') await applyToKeycloak();
  else if (mode === 'file') applyToFile();
  else {
    console.error('usage: node realm-google-provider.mjs <api|file>');
    process.exit(2);
  }
}
