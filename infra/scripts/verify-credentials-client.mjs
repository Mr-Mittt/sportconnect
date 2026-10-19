// U24: live check of the backend credentials client against the dev Keycloak (the realm must have had
// apply-realm-credentials-client.sh run). It does what the backend does, with the same calls and the same secret:
// the service-account token, the username lookup, the password grant, the admin reset-password.
//
//   node infra/scripts/verify-credentials-client.mjs
//
// Creates two users named u24-<run>-... (one with a password, one without) and deletes them at the end (also on failure).
// Exit code 1 if any check fails. Overrides: KEYCLOAK_URL (default http://localhost:8081), KEYCLOAK_ADMIN /
// KEYCLOAK_ADMIN_PASSWORD (default admin/admin), KEYCLOAK_REALM (default sportconnect), KEYCLOAK_CREDENTIALS_CLIENT_SECRET
// (default the dev value). Needs Node 18+.
import crypto from 'node:crypto';

import { CLIENT_ID, DEV_SECRET, SERVICE_ACCOUNT_ROLES } from './realm-credentials-client.mjs';

const URL_BASE = process.env.KEYCLOAK_URL ?? 'http://localhost:8081';
const REALM = process.env.KEYCLOAK_REALM ?? 'sportconnect';
const SECRET = process.env.KEYCLOAK_CREDENTIALS_CLIENT_SECRET ?? DEV_SECRET;
const TOKEN = `${URL_BASE}/realms/${REALM}/protocol/openid-connect/token`;
const RUN = crypto.randomBytes(3).toString('hex');
const PASSWORD = 'U24-check-password-1';
const NEW_PASSWORD = 'U24-check-password-2';

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`);
};

const adminToken = async () => {
  const response = await fetch(`${URL_BASE}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: process.env.KEYCLOAK_ADMIN ?? 'admin',
      password: process.env.KEYCLOAK_ADMIN_PASSWORD ?? 'admin',
    }),
  });
  if (!response.ok) throw new Error(`admin login failed: ${response.status}`);
  return (await response.json()).access_token;
};
const admin = async (path, init = {}) =>
  fetch(`${URL_BASE}/admin/realms/${REALM}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await adminToken()}`, 'Content-Type': 'application/json' },
  });

const clientForm = (grant, extra = {}) =>
  new URLSearchParams({ grant_type: grant, client_id: CLIENT_ID, client_secret: SECRET, ...extra });
const passwordGrant = (username, password, secret = SECRET) =>
  fetch(TOKEN, { method: 'POST', body: clientForm('password', { username, password, client_secret: secret }) });

const createdIds = [];
const createUser = async (name, password) => {
  const email = `u24-${RUN}-${name}@example.com`;
  const response = await admin('/users', {
    method: 'POST',
    body: JSON.stringify({
      username: email,
      email,
      firstName: 'U24',
      lastName: name,
      enabled: true,
      emailVerified: true,
      ...(password ? { credentials: [{ type: 'password', value: password, temporary: false }] } : {}),
    }),
  });
  if (response.status !== 201) throw new Error(`create user ${name} -> ${response.status} ${await response.text()}`);
  const id = response.headers.get('location').split('/').pop();
  createdIds.push(id);
  return { id, email };
};

try {
  // --- the client as configured ---------------------------------------------------------------------------------------
  const clients = await (await admin(`/clients?clientId=${CLIENT_ID}`)).json();
  const client = clients[0];
  check('the client exists', Boolean(client), 'run apply-realm-credentials-client.sh first');
  if (!client) throw new Error('no client');
  check('it is confidential', client.publicClient === false);
  check('it has no browser flow', client.standardFlowEnabled === false && client.implicitFlowEnabled === false);
  check('it allows the password grant and has a service account', client.directAccessGrantsEnabled === true && client.serviceAccountsEnabled === true);

  const management = (await (await admin('/clients?clientId=realm-management')).json())[0];
  const serviceUser = await (await admin(`/clients/${client.id}/service-account-user`)).json();
  const mapped = await (await admin(`/users/${serviceUser.id}/role-mappings/clients/${management.id}`)).json();
  const names = mapped.map((r) => r.name).sort();
  check(`the service account has exactly ${SERVICE_ACCOUNT_ROLES.join(' and ')}`, JSON.stringify(names) === JSON.stringify([...SERVICE_ACCOUNT_ROLES].sort()), names.join(','));

  // --- the backend's calls --------------------------------------------------------------------------------------------
  const withPassword = await createUser('pw', PASSWORD);
  const withoutPassword = await createUser('nopw', null);

  const wrongSecret = await passwordGrant(withPassword.email, PASSWORD, 'not-the-secret');
  const wrongSecretError = (await wrongSecret.json()).error;
  check('a wrong client secret is refused with 401 unauthorized_client (not invalid_grant, so the backend maps it to a 503, not to a wrong password)', wrongSecret.status === 401 && wrongSecretError === 'unauthorized_client', `${wrongSecret.status} ${wrongSecretError}`);

  const serviceResponse = await fetch(TOKEN, { method: 'POST', body: clientForm('client_credentials') });
  check('the service account gets a token', serviceResponse.ok, String(serviceResponse.status));
  const serviceToken = (await serviceResponse.json()).access_token;
  const asService = (path, init = {}) =>
    fetch(`${URL_BASE}/admin/realms/${REALM}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${serviceToken}`, 'Content-Type': 'application/json' },
    });

  const lookup = await asService(`/users/${withPassword.id}`);
  check('the service token reads a user by id (the username)', lookup.ok && (await lookup.json()).username === withPassword.email, String(lookup.status));
  const missing = await asService('/users/00000000-0000-0000-0000-000000000000');
  check('an unknown user id is a 404', missing.status === 404, String(missing.status));

  const right = await passwordGrant(withPassword.email, PASSWORD);
  check('the right password is accepted by the password grant', right.ok, String(right.status));
  const wrong = await passwordGrant(withPassword.email, 'not-the-password');
  const wrongBody = await wrong.json();
  check('a wrong password is invalid_grant (400 or 401), which the backend maps to false', [400, 401].includes(wrong.status) && wrongBody.error === 'invalid_grant', `${wrong.status} ${JSON.stringify(wrongBody)}`);
  const none = await passwordGrant(withoutPassword.email, PASSWORD);
  check('a user with no password is invalid_grant too (a social-only account)', [400, 401].includes(none.status) && (await none.json()).error === 'invalid_grant', String(none.status));

  const reset = await asService(`/users/${withPassword.id}/reset-password`, {
    method: 'PUT',
    body: JSON.stringify({ type: 'password', value: NEW_PASSWORD, temporary: false }),
  });
  check('the service account sets a new password (204)', reset.status === 204, String(reset.status));
  check('the old password stops working', !(await passwordGrant(withPassword.email, PASSWORD)).ok);
  check('the new password works', (await passwordGrant(withPassword.email, NEW_PASSWORD)).ok);

  const first = await asService(`/users/${withoutPassword.id}/reset-password`, {
    method: 'PUT',
    body: JSON.stringify({ type: 'password', value: NEW_PASSWORD, temporary: false }),
  });
  check('it also gives a user with no password their first one', first.status === 204 && (await passwordGrant(withoutPassword.email, NEW_PASSWORD)).ok, String(first.status));

  const weak = await asService(`/users/${withPassword.id}/reset-password`, {
    method: 'PUT',
    body: JSON.stringify({ type: 'password', value: 'short', temporary: false }),
  });
  check('the realm password policy refuses a short value with a 400 (NEW_PASSWORD_REJECTED)', weak.status === 400, String(weak.status));
  check('and the password is unchanged after a refusal', (await passwordGrant(withPassword.email, NEW_PASSWORD)).ok);

  // --- it cannot be used to sign a person in -------------------------------------------------------------------------
  const browser = await fetch(
    `${URL_BASE}/realms/${REALM}/protocol/openid-connect/auth?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent('http://localhost:5173/auth/callback')}`,
    { redirect: 'manual' },
  );
  const browserLocation = browser.headers.get('location') ?? '';
  check('the authorization (browser) flow is refused for this client', browser.status >= 400 || /error=/.test(browserLocation) || browserLocation === '', `${browser.status} ${browserLocation}`);
} catch (error) {
  failures += 1;
  console.log(`FAIL  unexpected error  -> ${error.message}`);
} finally {
  for (const id of createdIds) await admin(`/users/${id}`, { method: 'DELETE' });
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
