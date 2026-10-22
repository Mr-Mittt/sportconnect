// A29: one step to prove a social sign-in belongs to the existing account (its password, or an emailed link).
//
//   node infra/scripts/realm-link-existing-account.mjs api    # change the flow in a running Keycloak
//   node infra/scripts/realm-link-existing-account.mjs file   # copy the flows of the running Keycloak into sportconnect-realm.json
//
// In the realm's first-broker-login flow `sportconnect first broker login` (A35), the "Handle Existing Account" subflow
// holds Keycloak's "Confirm link existing account" page plus the "Account verification options" subflow (email or
// re-authentication). `api` replaces both with the single REQUIRED step `sc-link-existing-account` (extensions JAR,
// LinkExistingAccountAuthenticator): one page with "Use my password" / "Verify by email", which links only after a proof.
// The stock "Conditional 2FA" inside the re-authentication is dropped with it; the realm has no second factor today
// (revisit if one is ever enabled: the new step checks the password only).
// Needs the extensions JAR loaded (infra/scripts/build-keycloak-extensions.sh, then restart Keycloak). Idempotent.
//
// Overrides: KEYCLOAK_URL (default http://localhost:8081), KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD (admin/admin, the
// dev-only bootstrap account), KEYCLOAK_REALM (default sportconnect).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REALM_FILE = resolve(HERE, '../keycloak/realm/sportconnect-realm.json');

export const FLOW = 'sportconnect first broker login';
export const SUBFLOW = `${FLOW} Handle Existing Account`;
export const PROVIDER = 'sc-link-existing-account';
const STOCK_CONFIRM = 'idp-confirm-link';
const STOCK_VERIFICATION_SUFFIX = 'Account verification options';

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
  const executions = async () => await (await call(`/authentication/flows/${encodeURIComponent(FLOW)}/executions`)).json();
  const before = await executions();
  if (before.some((e) => e.providerId === PROVIDER)) {
    console.log(`keycloak ${url} realm ${realm}: already applied`);
    return;
  }
  const subflow = before.find((e) => e.authenticationFlow && e.displayName === SUBFLOW);
  if (!subflow) throw new Error(`flow "${FLOW}" has no "${SUBFLOW}" subflow: run apply-realm-email-normalized.sh first`);

  await call(`/authentication/flows/${encodeURIComponent(SUBFLOW)}/executions/execution`, {
    method: 'POST',
    body: JSON.stringify({ provider: PROVIDER }),
  });
  const created = (await executions()).find((e) => e.providerId === PROVIDER);
  if (!created) throw new Error(`the ${PROVIDER} step was not created: is the extensions JAR loaded?`);
  await call(`/authentication/flows/${encodeURIComponent(FLOW)}/executions`, {
    method: 'PUT',
    body: JSON.stringify({ ...created, requirement: 'REQUIRED' }),
  });

  // the stock confirmation page and the verification subflow (a flow execution removes its whole subflow)
  const stock = before.filter(
    (e) => e.level === subflow.level + 1 && (e.providerId === STOCK_CONFIRM || (e.authenticationFlow && e.displayName?.endsWith(STOCK_VERIFICATION_SUFFIX))),
  );
  for (const e of stock) await call(`/authentication/executions/${e.id}`, { method: 'DELETE' });
  console.log(`keycloak ${url} realm ${realm}: "${SUBFLOW}" now holds ${PROVIDER}; removed ${stock.length} stock steps`);
}

async function applyToFile() {
  const { url, realm, call } = await login();
  const executions = await (await call(`/authentication/flows/${encodeURIComponent(FLOW)}/executions`)).json();
  if (!executions.some((e) => e.providerId === PROVIDER)) {
    throw new Error('the running Keycloak does not have the link step yet: run `api` first');
  }
  const exported = await (await call('/partial-export?exportClients=false&exportGroupsAndRoles=false', { method: 'POST' })).json();
  const raw = readFileSync(REALM_FILE, 'utf8');
  const file = JSON.parse(raw);
  file.authenticationFlows = exported.authenticationFlows;
  file.authenticatorConfig = exported.authenticatorConfig;
  writeFileSync(REALM_FILE, JSON.stringify(file, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
  console.log(`realm file from ${url} realm ${realm}: ${exported.authenticationFlows.length} flows`);
}

const mode = process.argv[2];
if (process.argv[1]?.endsWith('realm-link-existing-account.mjs')) {
  if (mode === 'api') await applyToKeycloak();
  else if (mode === 'file') await applyToFile();
  else {
    console.error('usage: node realm-link-existing-account.mjs <api|file>');
    process.exit(2);
  }
}
