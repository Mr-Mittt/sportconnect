// A35: the realm side of the normalized-email rule (the provider JAR is infra/keycloak-extensions, class EmailRules).
//
//   node infra/scripts/realm-email-normalized.mjs api        # apply to a running Keycloak through the admin API
//   node infra/scripts/realm-email-normalized.mjs backfill   # fill email_normalized for the users that already exist
//   node infra/scripts/realm-email-normalized.mjs file       # copy the result from that running Keycloak into sportconnect-realm.json
//
// What `api` sets (idempotent):
//   1. user profile: the admin-only attribute `email_normalized` (nobody but an admin sees or edits it, so it never
//      shows on a register or account page) and the validator `sc-unique-email-normalized` on `email`;
//   2. the event listener `sc-email-normalizer` (keeps the attribute in step with the email);
//   3. the flow `sportconnect first broker login`: Keycloak's own first broker login with its "Create User If Unique" step
//      replaced by `sc-create-user-if-unique-normalized`, bound as the realm's first-broker-login flow (and set on any
//      identity provider that still names the stock flow), so a Google sign-in as baonguyendangit@gmail.com finds the
//      password account of bao.nguyen.dangit@gmail.com and goes to the existing-account confirmation.
//
// `backfill` is for users created before the listener existed (it reports an existing clash instead of resolving it).
// `file` reads the whole result from the running Keycloak (run `api` first), like realm-phone-rules.mjs: a realm import
// that lists `authenticationFlows` replaces ALL built-in flows, so the flows cannot be hand-written. Run `file` after
// realm-phone-rules.mjs `file` has been run against the same Keycloak (both copy the complete flow set).
// The provider JAR must be in infra/keycloak/providers before a Keycloak that imports this realm starts.
//
// Overrides: KEYCLOAK_URL (default http://localhost:8081), KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD
// (default admin/admin, the dev-only bootstrap account), KEYCLOAK_REALM (default sportconnect).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REALM_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../keycloak/realm/sportconnect-realm.json');
const PROFILE_PROVIDER = 'org.keycloak.userprofile.UserProfileProvider';

export const LISTENER = 'sc-email-normalizer';
export const ATTRIBUTE = 'email_normalized';
export const VALIDATOR = 'sc-unique-email-normalized';
export const STOCK_FLOW = 'first broker login';
export const FLOW = 'sportconnect first broker login';
export const STOCK_PROVIDER = 'idp-create-user-if-unique';
export const PROVIDER = 'sc-create-user-if-unique-normalized';
const SUBFLOW_SUFFIX = 'User creation or linking';

/**
 * The same rule as EmailRules.java (the Java class is the source of truth; this copy only serves `backfill`, and
 * verify-email-normalized.mjs checks it against the live listener): lowercase; for gmail.com / googlemail.com also no
 * dots and no +tag, googlemail.com read as gmail.com. Null for blank or not local@domain.
 */
export function normalizeEmail(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const email = String(raw).trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return null;
  let local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (domain !== 'gmail.com' && domain !== 'googlemail.com') return email;
  const plus = local.indexOf('+');
  if (plus >= 0) local = local.slice(0, plus);
  local = local.replaceAll('.', '');
  return local === '' ? email : `${local}@gmail.com`;
}

/** Adds the attribute and the validator to the profile config; returns what it added. */
export function withEmailNormalized(profile) {
  const added = [];
  if (!profile.attributes.some((a) => a.name === ATTRIBUTE)) {
    profile.attributes.push({
      name: ATTRIBUTE,
      displayName: '',
      validations: {},
      permissions: { view: ['admin'], edit: ['admin'] },
      multivalued: false,
    });
    added.push(`attribute:${ATTRIBUTE}`);
  }
  const email = profile.attributes.find((a) => a.name === 'email');
  if (!email) throw new Error('user profile has no attribute email');
  email.validations = email.validations ?? {};
  if (!email.validations[VALIDATOR]) {
    email.validations[VALIDATOR] = {};
    added.push(`email:${VALIDATOR}`);
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
  return { url, realm, call, headers };
}

async function applyToKeycloak() {
  const { url, realm, call } = await login();
  const log = [];

  const profile = await (await call('/users/profile')).json();
  const added = withEmailNormalized(profile);
  if (added.length > 0) {
    await call('/users/profile', { method: 'PUT', body: JSON.stringify(profile) });
    log.push(`profile added [${added}]`);
  }

  const current = await (await call('')).json();
  const update = {};
  const listeners = current.eventsListeners ?? [];
  if (!listeners.includes(LISTENER)) update.eventsListeners = [...listeners, LISTENER];

  const flows = await (await call('/authentication/flows')).json();
  if (!flows.some((f) => f.alias === FLOW)) {
    await call(`/authentication/flows/${encodeURIComponent(STOCK_FLOW)}/copy`, {
      method: 'POST',
      body: JSON.stringify({ newName: FLOW }),
    });
    const executions = async () => await (await call(`/authentication/flows/${encodeURIComponent(FLOW)}/executions`)).json();
    const before = await executions();
    // the copy renames the nested flows too ("<copy> User creation or linking"); the new step goes into that one
    const subflow = before.find((e) => e.authenticationFlow && e.displayName?.endsWith(SUBFLOW_SUFFIX));
    const stock = before.find((e) => e.providerId === STOCK_PROVIDER);
    if (!subflow || !stock) throw new Error(`flow "${FLOW}" has no "${SUBFLOW_SUFFIX}" subflow with ${STOCK_PROVIDER}`);
    await call(`/authentication/flows/${encodeURIComponent(subflow.displayName)}/executions/execution`, {
      method: 'POST',
      body: JSON.stringify({ provider: PROVIDER }),
    });
    const created = (await executions()).find((e) => e.providerId === PROVIDER);
    if (!created) throw new Error(`flow "${FLOW}" does not have the new ${PROVIDER} execution`);
    await call(`/authentication/flows/${encodeURIComponent(FLOW)}/executions`, {
      method: 'PUT',
      body: JSON.stringify({ ...created, requirement: 'ALTERNATIVE' }),
    });
    // the new step is appended last in its subflow; raise it above "Handle Existing Account", then drop the stock step
    for (let i = 0; i < 8; i++) {
      const now = (await executions()).find((e) => e.providerId === PROVIDER);
      if (now.index === 0) break;
      await call(`/authentication/executions/${created.id}/raise-priority`, { method: 'POST' });
    }
    await call(`/authentication/executions/${stock.id}`, { method: 'DELETE' });
    log.push(`flow "${FLOW}" created`);
  }
  if (current.firstBrokerLoginFlow !== FLOW) update.firstBrokerLoginFlow = FLOW;

  if (Object.keys(update).length > 0) {
    await call('', { method: 'PUT', body: JSON.stringify(update) });
    log.push(`realm updated ${JSON.stringify(update)}`);
  }

  // an identity provider that names the stock flow explicitly would bypass the realm binding
  const providers = await (await call('/identity-provider/instances')).json();
  for (const idp of providers.filter((p) => p.firstBrokerLoginFlowAlias === STOCK_FLOW)) {
    await call(`/identity-provider/instances/${idp.alias}`, {
      method: 'PUT',
      body: JSON.stringify({ ...idp, firstBrokerLoginFlowAlias: FLOW }),
    });
    log.push(`identity provider ${idp.alias} now uses "${FLOW}"`);
  }
  console.log(`keycloak ${url} realm ${realm}: ${log.length ? log.join('; ') : 'already applied'}`);
}

async function backfill() {
  const { url, realm, call, headers } = await login();
  let set = 0;
  let same = 0;
  const problems = [];
  for (let first = 0; ; first += 100) {
    const page = await (await call(`/users?first=${first}&max=100&briefRepresentation=false`)).json();
    for (const user of page) {
      const key = normalizeEmail(user.email);
      const stored = user.attributes?.[ATTRIBUTE]?.[0] ?? null;
      if (key === stored) {
        same += 1;
        continue;
      }
      const attributes = { ...(user.attributes ?? {}) };
      if (key === null) delete attributes[ATTRIBUTE];
      else attributes[ATTRIBUTE] = [key];
      const put = await fetch(`${url}/admin/realms/${realm}/users/${user.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ ...user, attributes }),
      });
      if (put.ok) set += 1;
      else problems.push(`${user.email ?? user.username}: ${put.status} ${await put.text()}`);
    }
    if (page.length < 100) break;
  }
  console.log(`keycloak ${url} realm ${realm}: email_normalized set on ${set} users, ${same} already right, ${problems.length} problems`);
  for (const p of problems) console.log(`  PROBLEM ${p}`);
  if (problems.length > 0) process.exit(1);
}

async function applyToFile() {
  const { url, realm, call } = await login();
  const live = await (await call('')).json();
  if (live.firstBrokerLoginFlow !== FLOW || !(live.eventsListeners ?? []).includes(LISTENER)) {
    throw new Error('the running Keycloak does not have the normalized-email rules yet: run `api` first');
  }
  const exported = await (await call('/partial-export?exportClients=false&exportGroupsAndRoles=false', { method: 'POST' })).json();
  const raw = readFileSync(REALM_FILE, 'utf8');
  const file = JSON.parse(raw);
  const component = file.components[PROFILE_PROVIDER][0];
  const profile = JSON.parse(component.config['kc.user.profile.config'][0]);
  const added = withEmailNormalized(profile);
  component.config['kc.user.profile.config'][0] = JSON.stringify(profile);
  file.eventsListeners = live.eventsListeners;
  file.firstBrokerLoginFlow = FLOW;
  file.authenticationFlows = exported.authenticationFlows;
  file.authenticatorConfig = exported.authenticatorConfig;
  writeFileSync(REALM_FILE, JSON.stringify(file, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
  console.log(`realm file from ${url} realm ${realm}: profile added [${added}], ${exported.authenticationFlows.length} flows, listeners ${JSON.stringify(live.eventsListeners)}`);
}

const mode = process.argv[2];
if (process.argv[1]?.endsWith('realm-email-normalized.mjs')) {
  if (mode === 'file') await applyToFile();
  else if (mode === 'api') await applyToKeycloak();
  else if (mode === 'backfill') await backfill();
  else {
    console.error('usage: node realm-email-normalized.mjs <api|backfill|file>');
    process.exit(2);
  }
}
