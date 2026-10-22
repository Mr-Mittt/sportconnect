// A36: live check that the Google picture reaches the access token, against the dev Keycloak (apply-realm-google-picture.sh
// and the A29 / A35 scripts run). Keycloak's built-in Google provider cannot be pointed at a stub, so the sign-ins are
// driven through a stub OpenID provider given the same mapper the script puts on `google`; what is checked of the real
// provider is that the mapper exists. Whether the backend USES the picture (once, https Google host only) is covered by
// KeycloakCallbackIntegrationTest, not here.
//
//   node infra/scripts/verify-google-picture.mjs
//
// Creates users a36-<run>... and an identity provider a36stub-<run>, deleted at the end (also on failure). Exit code 1
// if any check fails. Same overrides as verify-google-provider.mjs (the helpers below are copied from it).
import crypto from 'node:crypto';
import http from 'node:http';

import { ALIAS, ATTRIBUTE_NAME, CLIENT_ID as WEB_CLIENT, IDP_MAPPER_NAME, TOKEN_MAPPER_NAME, idpMapper } from './realm-google-picture.mjs';

const URL_BASE = process.env.KEYCLOAK_URL ?? 'http://localhost:8081';
const REALM = process.env.KEYCLOAK_REALM ?? 'sportconnect';
const OIDC = `${URL_BASE}/realms/${REALM}/protocol/openid-connect`;
const REDIRECT_URI = 'http://localhost:5173/auth/callback'; // only has to be a registered redirect; nothing listens
const PASSWORD = 'A36-check-password-1';
const RUN = crypto.randomBytes(3).toString('hex');
const STUB_PORT = Number(process.env.STUB_PORT ?? 8098);
const STUB_FROM_KEYCLOAK = `http://${process.env.STUB_HOST_FOR_KEYCLOAK ?? 'host.docker.internal'}:${STUB_PORT}`;
const STUB_FROM_HERE = `http://localhost:${STUB_PORT}`;
const IDP = `a36stub-${RUN}`;
const PICTURE = 'https://lh3.googleusercontent.com/a/a36-check=s96-c';
const PICTURE_2 = 'https://lh3.googleusercontent.com/a/a36-second=s96-c';

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
    `${OIDC}/auth?client_id=${WEB_CLIENT}&response_type=code&scope=openid&code_challenge=${challenge}` +
    `&code_challenge_method=S256&redirect_uri=${encodeURIComponent(REDIRECT_URI)}${extra}`
  );
};
const loginActionOf = (html) => new URL(unescapeContext(html, 'loginAction'), URL_BASE).href;
const pageIdOf = (html) => /pageId = "([^"]+).ftl"/.exec(html)?.[1];
const formPost = (action, jar, fields) =>
  fetch(action, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookieHeader(jar) },
    body: new URLSearchParams(fields),
  });
const claimsOf = (jwt) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());

/** Follows redirects (cookies kept) until the app redirect or a page; returns {code} or {html, text, status}. */
async function follow(start, jar) {
  let target = start;
  for (let hop = 0; hop < 12; hop += 1) {
    const response = await fetch(target, { redirect: 'manual', headers: { Cookie: cookieHeader(jar) } });
    absorb(jar, response);
    const location = response.headers.get('location');
    if (location?.startsWith(REDIRECT_URI)) return { code: new URL(location).searchParams.get('code') };
    if (!location) {
      const html = await response.text();
      return { html, text: text(html), status: response.status };
    }
    target = new URL(location, target).href;
  }
  return { text: 'too many redirects' };
}

// --- stub OpenID provider (what Google is, for this check) -----------------------------------------------------------
const pending = new Map(); // code -> { nonce, claims }
let nextIdentity = null;
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
      const entry = pending.get(new URLSearchParams(body).get('code'));
      if (!entry) return res.writeHead(400).end('{"error":"invalid_grant"}');
      const now = Math.floor(Date.now() / 1000);
      const claims = { iss: STUB_FROM_KEYCLOAK, aud: `${IDP}-client`, iat: now, exp: now + 300, nonce: entry.nonce, given_name: 'Stub', family_name: 'Google', ...entry.claims };
      const signingInput = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}`;
      const signature = crypto.createHmac('sha256', 'stub').update(signingInput).digest('base64url');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ access_token: `at-${entry.nonce}`, token_type: 'Bearer', expires_in: 300, id_token: `${signingInput}.${signature}` }));
    });
  } else {
    res.writeHead(404).end();
  }
});

const createStub = async () => {
  const created = await admin('/identity-provider/instances', {
    method: 'POST',
    body: JSON.stringify({
      alias: IDP,
      displayName: 'Google',
      providerId: 'oidc',
      enabled: true,
      trustEmail: false,
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
  return created.status;
};

async function exchange(authCode, verifier) {
  const response = await fetch(`${OIDC}/token`, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: WEB_CLIENT, code: authCode, code_verifier: verifier, redirect_uri: REDIRECT_URI }),
  });
  return response.ok ? await response.json() : null;
}

/** Browser flow through the stub as `identity`; keeps the PKCE verifier so the code can be exchanged. */
async function brokerSession(identity) {
  nextIdentity = identity;
  const verifier = crypto.randomBytes(32).toString('base64url');
  const jar = new Map();
  const result = await follow(authUrl(verifier, `&kc_idp_hint=${IDP}`), jar);
  return { ...result, jar, verifier };
}
const claimsAfter = async (session) => {
  const tokens = session.code ? await exchange(session.code, session.verifier) : null;
  return tokens ? claimsOf(tokens.access_token) : null;
};

async function main() {
  if (!(await fetch(`${URL_BASE}/realms/${REALM}`)).ok) throw new Error(`no realm ${REALM} on ${URL_BASE}`);

  // 1. the realm pieces
  const profile = await (await admin('/users/profile')).json();
  const attribute = profile.attributes.find((a) => a.name === ATTRIBUTE_NAME);
  check('the user profile has the picture attribute, editable by an admin only', attribute?.permissions?.edit?.join() === 'admin', JSON.stringify(attribute));
  const [web] = await (await admin(`/clients?clientId=${WEB_CLIENT}`)).json();
  const tokenMappers = await (await admin(`/clients/${web.id}/protocol-mappers/models`)).json();
  const tokenMapper = tokenMappers.find((m) => m.name === TOKEN_MAPPER_NAME);
  check('the web client puts the picture attribute in the access token as picture', tokenMapper?.config?.['claim.name'] === 'picture' && tokenMapper.config['access.token.claim'] === 'true', JSON.stringify(tokenMapper));
  const google = await admin(`/identity-provider/instances/${ALIAS}`);
  if (google.status === 200) {
    const mappers = await (await admin(`/identity-provider/instances/${ALIAS}/mappers`)).json();
    const mapper = mappers.find((m) => m.name === IDP_MAPPER_NAME);
    check('google copies its picture claim into the attribute on every sign-in (FORCE sync)', mapper?.config?.claim === 'picture' && mapper.config.syncMode === 'FORCE', JSON.stringify(mapper));
  } else {
    console.log('SKIP  google provider is not configured here: its mapper is not checked');
  }

  // 2. a stub provider carrying the same mapper
  check('the stub provider is created', (await createStub()) === 201);
  const mapperCreated = await admin(`/identity-provider/instances/${IDP}/mappers`, { method: 'POST', body: JSON.stringify(idpMapper(IDP)) });
  check('and gets the same picture mapper', mapperCreated.status === 201, String(mapperCreated.status));

  // 3. a new account from the provider: the token carries the picture
  const fresh = await brokerSession({ sub: `n-${RUN}`, email: `a36.${RUN}.new@outlook.com`, email_verified: true, picture: PICTURE });
  const freshClaims = await claimsAfter(fresh);
  check('a new account from the provider goes in', freshClaims !== null, fresh.text?.slice(0, 200));
  check('its token carries the picture', freshClaims?.picture === PICTURE, JSON.stringify(freshClaims));
  const freshUser = await userByEmail(`a36.${RUN}.new@outlook.com`);
  check('the picture is stored on the user as the picture attribute', freshUser?.attributes?.[ATTRIBUTE_NAME]?.[0] === PICTURE, JSON.stringify(freshUser?.attributes));

  // 4. an existing password account, linked by its password: the token carries the picture (a link is not an import)
  const email = `a36.${RUN}.old@outlook.com`;
  const created = await admin('/users', {
    method: 'POST',
    body: JSON.stringify({ username: `a36old${RUN}`, email, emailVerified: true, enabled: true, firstName: 'A36', lastName: 'Old', credentials: [{ type: 'password', value: PASSWORD, temporary: false }] }),
  });
  check('a password account is created', created.status === 201, `${created.status} ${await created.text()}`);
  const existing = await userByEmail(email);
  const linking = await brokerSession({ sub: `l-${RUN}`, email, email_verified: true, picture: PICTURE });
  check('a sign-in with that email lands on the account-already-exists page', pageIdOf(linking.html ?? '') === 'login-idp-link-confirm', pageIdOf(linking.html ?? '') ?? linking.text?.slice(0, 200));
  check('before the proof nothing is stored on the existing account', existing?.attributes?.[ATTRIBUTE_NAME] === undefined, JSON.stringify(existing?.attributes));
  const proof = await formPost(loginActionOf(linking.html), linking.jar, { linkMethod: 'password', password: PASSWORD });
  absorb(linking.jar, proof);
  const next = proof.headers.get('location');
  const linked = next ? await follow(new URL(next, URL_BASE).href, linking.jar) : { text: 'no redirect after the password' };
  const linkedClaims = await claimsAfter({ ...linked, verifier: linking.verifier });
  check('the password proof links and signs in', linkedClaims?.sub === existing?.id, `${linkedClaims?.sub} vs ${existing?.id} ${linked.text?.slice(0, 200)}`);
  check('the token of the linked existing account carries the picture', linkedClaims?.picture === PICTURE, JSON.stringify(linkedClaims));

  // 5. a provider that sends no picture: no claim (the backend then only records the first sign-in)
  const bare = await brokerSession({ sub: `b-${RUN}`, email: `a36.${RUN}.bare@outlook.com`, email_verified: true });
  const bareClaims = await claimsAfter(bare);
  check('a sign-in without a picture has no picture claim', bareClaims !== null && bareClaims.picture === undefined, JSON.stringify(bareClaims));

  // 6. a later sign-in follows the provider's current picture (the backend, not Keycloak, makes it a one-time thing)
  const later = await brokerSession({ sub: `n-${RUN}`, email: `a36.${RUN}.new@outlook.com`, email_verified: true, picture: PICTURE_2 });
  const laterClaims = await claimsAfter(later);
  check('a later sign-in carries the provider picture of that moment (FORCE sync)', laterClaims?.picture === PICTURE_2, JSON.stringify(laterClaims));
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
  const mine = (await usersWhere('search=a36')).filter((u) => (u.email ?? '').toLowerCase().includes(`a36.${RUN}`) || (u.username ?? '').includes(`a36old${RUN}`));
  for (const user of mine) await admin(`/users/${user.id}`, { method: 'DELETE' });
  console.log(`cleaned up ${mine.length} users`);
}
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
