// A35: live check of the normalized-email rule against the dev Keycloak (the realm must have had
// apply-realm-email-normalized.sh run, with the provider JAR loaded). It drives the real registration page and a real
// first-broker-login against a stub OpenID provider started by this script, so it exercises the validator, the
// normalizer listener and the broker step exactly as a browser sign-in with Google would.
//
//   node infra/scripts/verify-email-normalized.mjs
//
// Creates users named a35-<run>... and an identity provider `a35stub-<run>`, and deletes them at the end (also on
// failure). Exit code 1 if any check fails. Overrides: KEYCLOAK_URL (default http://localhost:8081), KEYCLOAK_ADMIN /
// KEYCLOAK_ADMIN_PASSWORD (default admin/admin), KEYCLOAK_REALM (default sportconnect), STUB_PORT (default 8099),
// STUB_HOST_FOR_KEYCLOAK (how the Keycloak container reaches this machine, default host.docker.internal). Needs Node 18+.
import crypto from 'node:crypto';
import http from 'node:http';

import { normalizeEmail } from './realm-email-normalized.mjs';

const URL_BASE = process.env.KEYCLOAK_URL ?? 'http://localhost:8081';
const REALM = process.env.KEYCLOAK_REALM ?? 'sportconnect';
const OIDC = `${URL_BASE}/realms/${REALM}/protocol/openid-connect`;
const CLIENT_ID = 'sportconnect-web';
const REDIRECT_URI = 'http://localhost:5173/auth/callback'; // only has to be a registered redirect; nothing listens
const PASSWORD = 'A35-check-password-1';
const RUN = crypto.randomBytes(3).toString('hex');
const STUB_PORT = Number(process.env.STUB_PORT ?? 8099);
const STUB_FROM_KEYCLOAK = `http://${process.env.STUB_HOST_FOR_KEYCLOAK ?? 'host.docker.internal'}:${STUB_PORT}`;
const STUB_FROM_HERE = `http://localhost:${STUB_PORT}`;
const IDP = `a35stub-${RUN}`;

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`);
};

// --- admin API -----------------------------------------------------------------------------------------------------
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
const usersWhere = async (query) => await (await admin(`/users?${query}&briefRepresentation=false`)).json();
const userByEmail = async (address) => (await usersWhere(`email=${encodeURIComponent(address)}&exact=true`))[0];

// --- scripted pages ------------------------------------------------------------------------------------------------
const cookieHeader = (jar) => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
const absorb = (jar, response) => {
  for (const line of response.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';');
    const [name, ...rest] = pair.split('=');
    jar.set(name.trim(), rest.join('='));
  }
};
const unescapeContext = (html, key) => {
  const raw = new RegExp(`"${key}":\\s*"([^"]+)"`).exec(html)?.[1];
  return raw === undefined ? undefined : JSON.parse(`"${raw}"`).replace(/&amp;/g, '&');
};
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const authUrl = (verifier, extra = '') => {
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return (
    `${OIDC}/auth?client_id=${CLIENT_ID}&response_type=code&scope=openid&code_challenge=${challenge}` +
    `&code_challenge_method=S256&redirect_uri=${encodeURIComponent(REDIRECT_URI)}${extra}`
  );
};
const codeFrom = (response) => {
  const location = response.headers.get('location') ?? '';
  return location.startsWith(REDIRECT_URI) ? new URL(location).searchParams.get('code') : null;
};

/** Submits the register page; {ok} when Keycloak redirected back with a code, else {html} with the page's errors. */
async function register(fields) {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const jar = new Map();
  const login = await fetch(authUrl(verifier));
  absorb(jar, login);
  const registrationUrl = new URL(unescapeContext(await login.text(), 'registrationUrl'), URL_BASE).href;
  const page = await fetch(registrationUrl, { headers: { Cookie: cookieHeader(jar) } });
  absorb(jar, page);
  const action = new URL(unescapeContext(await page.text(), 'registrationAction'), URL_BASE).href;
  const submit = await fetch(action, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookieHeader(jar) },
    body: new URLSearchParams({ firstName: 'A35', lastName: 'Check', password: PASSWORD, 'password-confirm': PASSWORD, ...fields }),
  });
  if (codeFrom(submit)) return { ok: true };
  return { ok: false, html: text(await submit.text()) };
}

// --- stub OpenID provider (what Google is, for this check) -----------------------------------------------------------
const pending = new Map(); // code -> { nonce, claims }
let nextIdentity = null; // set before each broker run: { sub, email, email_verified }
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const stub = http.createServer((req, res) => {
  const url = new URL(req.url, STUB_FROM_HERE);
  if (url.pathname === '/authorize') {
    const code = crypto.randomBytes(8).toString('hex');
    pending.set(code, { nonce: url.searchParams.get('nonce'), claims: nextIdentity });
    const back = new URL(url.searchParams.get('redirect_uri'));
    back.searchParams.set('code', code);
    back.searchParams.set('state', url.searchParams.get('state'));
    res.writeHead(302, { Location: back.href }).end();
  } else if (url.pathname === '/token') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const code = new URLSearchParams(body).get('code');
      const entry = pending.get(code);
      if (!entry) return res.writeHead(400).end('{"error":"invalid_grant"}');
      const now = Math.floor(Date.now() / 1000);
      const claims = {
        iss: STUB_FROM_KEYCLOAK,
        aud: `${IDP}-client`,
        iat: now,
        exp: now + 300,
        nonce: entry.nonce,
        given_name: 'Stub',
        family_name: 'Google',
        ...entry.claims,
      };
      const signingInput = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}`;
      const signature = crypto.createHmac('sha256', 'stub').update(signingInput).digest('base64url');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ access_token: `at-${code}`, token_type: 'Bearer', expires_in: 300, id_token: `${signingInput}.${signature}` }));
    });
  } else {
    res.writeHead(404).end();
  }
});

/** Runs the browser flow through the stub provider as `identity`; returns where it ended. */
async function brokerLogin(identity) {
  nextIdentity = identity;
  const verifier = crypto.randomBytes(32).toString('base64url');
  const jar = new Map();
  let target = authUrl(verifier, `&kc_idp_hint=${IDP}`);
  for (let hop = 0; hop < 12; hop += 1) {
    const response = await fetch(target, { redirect: 'manual', headers: { Cookie: cookieHeader(jar) } });
    absorb(jar, response);
    const location = response.headers.get('location');
    if (location?.startsWith(REDIRECT_URI)) return { done: true, code: new URL(location).searchParams.get('code') };
    if (!location) {
      const html = await response.text();
      return { done: false, status: response.status, html, text: text(html), jar, url: target };
    }
    target = new URL(location, target).href;
  }
  return { done: false, text: 'too many redirects', jar };
}

const ALREADY_USED = /email address is already used by another account/;
const gmail = (local) => `${local}@gmail.com`;

async function main() {
  const keycloakUp = (await fetch(`${URL_BASE}/realms/${REALM}`)).ok;
  if (!keycloakUp) throw new Error(`no realm ${REALM} on ${URL_BASE}`);

  // 1. registration: the stored key, and the spellings of one Gmail mailbox
  const base = `a35${RUN}`;
  const dotted = gmail(`a35.${RUN}.shop`);
  const first = await register({ email: dotted });
  check('register a dotted Gmail succeeds', first.ok, first.html?.slice(0, 200));
  const firstUser = await userByEmail(dotted);
  check('email_normalized is stored without dots', firstUser?.attributes?.email_normalized?.[0] === gmail(`${base}shop`), JSON.stringify(firstUser?.attributes));
  check('the registered email is kept as typed (lowercase)', firstUser?.email === dotted, firstUser?.email);
  for (const [label, address] of [
    ['the undotted spelling', gmail(`${base}shop`)],
    ['a +tag spelling', gmail(`${base}shop+promo`)],
    ['the googlemail.com spelling', `${base}.shop@googlemail.com`],
    ['an upper-case spelling', gmail(`A35.${RUN.toUpperCase()}.Shop`)],
  ]) {
    const clash = await register({ email: address });
    check(`${label} is refused as taken`, !clash.ok && ALREADY_USED.test(clash.html), clash.html?.slice(0, 200));
  }

  // 2. other domains keep dots and + significant
  const outlookDotted = `a35.${RUN}.o@outlook.com`;
  const outlookPlain = `a35${RUN}o@outlook.com`;
  const o1 = await register({ email: outlookDotted });
  const o2 = await register({ email: outlookPlain });
  check('two Outlook addresses that differ by a dot are both accepted', o1.ok && o2.ok, `${o1.html ?? ''} ${o2.html ?? ''}`.slice(0, 200));
  const o1User = await userByEmail(outlookDotted);
  check('an Outlook key is only lowercased', o1User?.attributes?.email_normalized?.[0] === outlookDotted, JSON.stringify(o1User?.attributes));

  // 3. the JavaScript twin used by the backfill agrees with the Java listener
  const sample = [dotted, outlookDotted];
  for (const address of sample) {
    const user = await userByEmail(address);
    check(`backfill rule matches the listener for ${address}`, normalizeEmail(address) === user?.attributes?.email_normalized?.[0]);
  }

  // 4. profile update through the admin API runs the same validator, and a change refreshes the key
  const other = await userByEmail(outlookPlain);
  const clashUpdate = await admin(`/users/${other.id}`, { method: 'PUT', body: JSON.stringify({ ...other, email: gmail(`${base}.shop`) }) });
  check('changing an email to a taken Gmail spelling is refused (admin API)', clashUpdate.status === 400, `status ${clashUpdate.status}`);
  const own = await admin(`/users/${firstUser.id}`, { method: 'PUT', body: JSON.stringify(firstUser) });
  check('saving a user with their own email is not a clash', own.status === 204, `status ${own.status}`);

  // 5. first broker login through the stub provider
  await admin('/identity-provider/instances', {
    method: 'POST',
    body: JSON.stringify({
      alias: IDP,
      providerId: 'oidc',
      enabled: true,
      trustEmail: true,
      config: {
        clientId: `${IDP}-client`,
        clientSecret: 'stub',
        authorizationUrl: `${STUB_FROM_HERE}/authorize`,
        tokenUrl: `${STUB_FROM_KEYCLOAK}/token`,
        issuer: STUB_FROM_KEYCLOAK,
        validateSignature: 'false',
        useJwksUrl: 'false',
        clientAuthMethod: 'client_secret_post',
        defaultScope: 'openid email profile',
        syncMode: 'IMPORT',
      },
    }),
  });
  const idp = await (await admin(`/identity-provider/instances/${IDP}`)).json();
  check('the provider uses the realm first-broker-login binding (no stock flow named on it)', idp.firstBrokerLoginFlowAlias == null || idp.firstBrokerLoginFlowAlias === 'sportconnect first broker login', String(idp.firstBrokerLoginFlowAlias));

  const brokerNew = await brokerLogin({ sub: `g-new-${RUN}`, email: gmail(`a35.${RUN}.fresh`), email_verified: true });
  check('a Google sign-in with an unknown email creates the account and finishes', brokerNew.done, brokerNew.text?.slice(0, 300));
  const fresh = await userByEmail(gmail(`a35.${RUN}.fresh`));
  check('the new social user has email_normalized', fresh?.attributes?.email_normalized?.[0] === gmail(`a35${RUN}fresh`), JSON.stringify(fresh?.attributes));

  const before = (await usersWhere(`search=${base}`)).length;
  const brokerClash = await brokerLogin({ sub: `g-clash-${RUN}`, email: gmail(`${base}shop`), email_verified: true });
  check('a Google sign-in as another spelling of a registered Gmail does not finish silently', !brokerClash.done, 'it was logged in without confirmation');
  check(
    'it lands on the existing-account confirmation, not a profile error',
    !brokerClash.done && /login-idp-link-confirm|already exists/i.test(brokerClash.html ?? '') && !ALREADY_USED.test(brokerClash.text ?? ''),
    brokerClash.text?.slice(0, 300),
  );
  check('no second account was created for that mailbox', (await usersWhere(`search=${base}`)).length === before);
  check('the existing account has no link to the provider yet', (await (await admin(`/users/${firstUser.id}/federated-identity`)).json()).length === 0);
}

try {
  await new Promise((resolve) => stub.listen(STUB_PORT, resolve));
  await main();
} catch (error) {
  failures += 1;
  console.error('FAIL  unexpected error', error);
} finally {
  stub.close();
  await admin(`/identity-provider/instances/${IDP}`, { method: 'DELETE' });
  const created = (await usersWhere(`search=a35`)).filter((u) => u.firstName === 'A35' || u.firstName === 'Stub');
  const base = `a35${RUN}`;
  const mine = created.filter((u) => (u.email ?? '').replaceAll('.', '').toLowerCase().includes(base) || (u.email ?? '').includes(`a35.${RUN}`));
  for (const user of mine) await admin(`/users/${user.id}`, { method: 'DELETE' });
  console.log(`cleaned up ${mine.length} users`);
}
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
