// A27: the realm side of the phone rules (the provider JAR is infra/keycloak-extensions).
//
//   node infra/scripts/realm-phone-rules.mjs api    # apply to a running Keycloak through the admin API
//   node infra/scripts/realm-phone-rules.mjs file   # copy the result from that running Keycloak into sportconnect-realm.json
//
// What `api` sets (idempotent):
//   1. user profile: `sc-unique-phone` and `sc-email-or-phone` on `phoneNumber`, `sc-email-or-phone` on `email`;
//   2. the event listener `sc-phone-normalizer` (stores the canonical phone, gives a phone-only user its internal username);
//   3. the browser flow `sportconnect browser`: Keycloak's own browser flow with its Username Password Form replaced by
//      `sc-phone-login-form` (accepts a phone number), bound as the realm's browser flow;
//   4. the registration flow `sportconnect registration`: Keycloak's own plus `sc-registration-username`, which fills a
//      missing username with the email, else the phone, bound as the realm's registration flow;
//   5. `registrationEmailAsUsername: false` (that setting makes an email mandatory, which rules out a phone-only account).
//
// `file` is not an independent definition: a realm import that lists `authenticationFlows` replaces ALL of Keycloak's
// default flows, so the flow set cannot be hand-written here. It reads the whole result from the running Keycloak (run
// `api` first), so the realm file carries exactly what the admin API produced (the realm-change rule in CLAUDE.md).
// The provider JAR must be in infra/keycloak/providers before a Keycloak that imports this realm starts.
//
// Overrides: KEYCLOAK_URL (default http://localhost:8081), KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD
// (default admin/admin, the dev-only bootstrap account), KEYCLOAK_REALM (default sportconnect).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REALM_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../keycloak/realm/sportconnect-realm.json');
const PROFILE_PROVIDER = 'org.keycloak.userprofile.UserProfileProvider';

export const LISTENER = 'sc-phone-normalizer';
export const FLOW = 'sportconnect browser';
export const LOGIN_PROVIDER = 'sc-phone-login-form';
export const REGISTRATION_FLOW = 'sportconnect registration';
export const REGISTRATION_PROVIDER = 'sc-registration-username';
const VALIDATORS = { phoneNumber: ['sc-unique-phone', 'sc-email-or-phone'], email: ['sc-email-or-phone'] };

/** Adds the validators to the profile config; returns what it added. */
export function withValidators(profile) {
  const added = [];
  for (const [name, validators] of Object.entries(VALIDATORS)) {
    const attribute = profile.attributes.find((a) => a.name === name);
    if (!attribute) throw new Error(`user profile has no attribute ${name}`);
    attribute.validations = attribute.validations ?? {};
    for (const validator of validators) {
      if (!attribute.validations[validator]) {
        attribute.validations[validator] = {};
        added.push(`${name}:${validator}`);
      }
    }
  }
  return added;
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
    if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${response.status} ${await response.text()}`);
    return response;
  };
  return { url, realm, call };
}

async function applyToKeycloak() {
  const { url, realm, call } = await login();
  const log = [];

  const profile = await (await call('/users/profile')).json();
  const added = withValidators(profile);
  if (added.length > 0) {
    await call('/users/profile', { method: 'PUT', body: JSON.stringify(profile) });
    log.push(`validators added [${added}]`);
  }

  const current = await (await call('')).json();
  const listeners = current.eventsListeners ?? [];
  const update = {};
  if (!listeners.includes(LISTENER)) update.eventsListeners = [...listeners, LISTENER];

  const flows = await (await call('/authentication/flows')).json();
  // Copy a built-in flow, add our execution to one of its subflows (first in line), optionally drop a stock one.
  const copyFlow = async (builtIn, copy, subflow, provider, dropProvider) => {
    if (flows.some((f) => f.alias === copy)) return;
    await call(`/authentication/flows/${builtIn}/copy`, { method: 'POST', body: JSON.stringify({ newName: copy }) });
    await call(`/authentication/flows/${encodeURIComponent(subflow)}/executions/execution`, {
      method: 'POST',
      body: JSON.stringify({ provider }),
    });
    const executions = async () => await (await call(`/authentication/flows/${encodeURIComponent(copy)}/executions`)).json();
    const list = await executions();
    const created = list.find((e) => e.providerId === provider);
    if (!created) throw new Error(`flow "${copy}" does not have the new execution`);
    await call(`/authentication/flows/${encodeURIComponent(copy)}/executions`, {
      method: 'PUT',
      body: JSON.stringify({ ...created, requirement: 'REQUIRED' }),
    });
    // the new execution is appended last; raise it to the top of its subflow
    for (let i = 0; i < 8; i++) {
      const now = (await executions()).find((e) => e.providerId === provider);
      if (now.index === 0) break;
      await call(`/authentication/executions/${created.id}/raise-priority`, { method: 'POST' });
    }
    if (dropProvider) {
      const stock = list.find((e) => e.providerId === dropProvider);
      if (!stock) throw new Error(`flow "${copy}" has no ${dropProvider} to replace`);
      await call(`/authentication/executions/${stock.id}`, { method: 'DELETE' });
    }
    log.push(`flow "${copy}" created`);
  };
  await copyFlow('browser', FLOW, `${FLOW} forms`, LOGIN_PROVIDER, 'auth-username-password-form');
  await copyFlow('registration', REGISTRATION_FLOW, `${REGISTRATION_FLOW} registration form`, REGISTRATION_PROVIDER);
  if (current.browserFlow !== FLOW) update.browserFlow = FLOW;
  if (current.registrationFlow !== REGISTRATION_FLOW) update.registrationFlow = REGISTRATION_FLOW;
  // The username is the identifier the user registers with (the email, or the phone for a phone-only account), so
  // Keycloak must not force the email into it (that setting makes an email mandatory).
  if (current.registrationEmailAsUsername !== false) update.registrationEmailAsUsername = false;

  if (Object.keys(update).length > 0) {
    await call('', { method: 'PUT', body: JSON.stringify(update) });
    log.push(`realm updated ${JSON.stringify(update)}`);
  }
  console.log(`keycloak ${url} realm ${realm}: ${log.length ? log.join('; ') : 'already applied'}`);
}

async function applyToFile() {
  const { url, realm, call } = await login();
  const live = await (await call('')).json();
  if (live.browserFlow !== FLOW || live.registrationFlow !== REGISTRATION_FLOW || live.registrationEmailAsUsername !== false || !(live.eventsListeners ?? []).includes(LISTENER)) {
    throw new Error('the running Keycloak does not have the phone rules yet: run `api` first');
  }
  const exported = await (await call('/partial-export?exportClients=false&exportGroupsAndRoles=false', { method: 'POST' })).json();
  const raw = readFileSync(REALM_FILE, 'utf8');
  const file = JSON.parse(raw);
  const component = file.components[PROFILE_PROVIDER][0];
  const profile = JSON.parse(component.config['kc.user.profile.config'][0]);
  const added = withValidators(profile);
  component.config['kc.user.profile.config'][0] = JSON.stringify(profile);
  file.eventsListeners = live.eventsListeners;
  file.browserFlow = FLOW;
  file.registrationFlow = REGISTRATION_FLOW;
  file.registrationEmailAsUsername = false;
  file.authenticationFlows = exported.authenticationFlows;
  file.authenticatorConfig = exported.authenticatorConfig;
  writeFileSync(REALM_FILE, JSON.stringify(file, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
  console.log(`realm file from ${url} realm ${realm}: validators added [${added}], ${exported.authenticationFlows.length} flows, listeners ${JSON.stringify(live.eventsListeners)}`);
}

const mode = process.argv[2];
if (mode === 'file') await applyToFile();
else if (mode === 'api') await applyToKeycloak();
else {
  console.error('usage: node realm-phone-rules.mjs <api|file>');
  process.exit(2);
}
