// A33: a brand-new account created from a Google sign-in starts with its email verified.
//
//   node infra/scripts/realm-google-email-verified.mjs api    # apply to a running Keycloak through the admin API
//   node infra/scripts/realm-google-email-verified.mjs file   # apply the same definition to sportconnect-realm.json
//
// One identity-provider mapper on `google`, of the type the extensions JAR provides (`sc-email-verified-importer`,
// VerifiedEmailImporter): it runs only when Keycloak creates the user and sets `emailVerified` when Google's token says
// `email_verified`. It exists because the provider keeps `trustEmail: false` on purpose (A29: an existing account is
// always proven, never silently linked), and with that setting Keycloak ignores the claim. A Google sign-in that links to
// an existing account never reaches it, so that account keeps what it had. One definition for both targets (the
// realm-change rule in CLAUDE.md); both modes are idempotent.
//
// Needs the extensions JAR loaded (infra/scripts/build-keycloak-extensions.sh, then restart Keycloak) and, for `api`, the
// `google` provider (apply-realm-google-provider.sh). Run `api` through infra/scripts/apply-realm-google-email-verified.sh.
// Overrides for `api`: KEYCLOAK_URL (default http://localhost:8081), KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD (default
// admin/admin), KEYCLOAK_REALM (default sportconnect).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ALIAS = 'google';
export const MAPPER_NAME = 'google-email-verified';
export const MAPPER_TYPE = 'sc-email-verified-importer';
const REALM_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../keycloak/realm/sportconnect-realm.json');

/** The provider mapper; `alias` is `google`, or a stub provider's alias in the live check. */
export const idpMapper = (alias) => ({
  name: MAPPER_NAME,
  identityProviderAlias: alias,
  identityProviderMapper: MAPPER_TYPE,
  config: { syncMode: 'IMPORT' },
});

function applyToFile() {
  const raw = readFileSync(REALM_FILE, 'utf8');
  const realm = JSON.parse(raw);
  realm.identityProviderMappers ??= [];
  const added = !realm.identityProviderMappers.some((m) => m.identityProviderAlias === ALIAS && m.name === MAPPER_NAME);
  if (added) realm.identityProviderMappers.push(idpMapper(ALIAS));
  writeFileSync(REALM_FILE, JSON.stringify(realm, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
  console.log(`realm file: provider mapper added ${added}`);
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
  const provider = await fetch(`${url}/admin/realms/${realm}/identity-provider/instances/${ALIAS}`, { headers });
  if (!provider.ok) {
    console.log(`provider ${ALIAS} does not exist here yet: run apply-realm-google-provider.sh, then this script again`);
    return;
  }
  const base = `${url}/admin/realms/${realm}/identity-provider/instances/${ALIAS}/mappers`;
  const mappers = await (await fetch(base, { headers })).json();
  const added = !mappers.some((m) => m.name === MAPPER_NAME);
  if (added) {
    const response = await fetch(base, { method: 'POST', headers, body: JSON.stringify(idpMapper(ALIAS)) });
    if (!response.ok) throw new Error(`POST mapper -> ${response.status} ${await response.text()} (is the extensions JAR loaded?)`);
  }
  console.log(`keycloak ${url} realm ${realm}: provider mapper added ${added}`);
}

const mode = process.argv[2];
if (process.argv[1]?.endsWith('realm-google-email-verified.mjs')) {
  if (mode === 'file') applyToFile();
  else if (mode === 'api') await applyToKeycloak();
  else {
    console.error('usage: node realm-google-email-verified.mjs <api|file>');
    process.exit(2);
  }
}
