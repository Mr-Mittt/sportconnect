// A29: live check of the Google sign-in set-up and of the "you already signed up with this email" path, against the dev
// Keycloak (apply-realm-google-provider.sh run, A35 rules applied, Mailpit on :8025). Keycloak's built-in Google
// provider cannot be pointed at a stub, so the existing-account path is driven through a stub OpenID provider with the
// same settings the script gives Google (trustEmail false, the realm's first-broker-login binding); what is checked of
// the real Google provider is its configuration. A real Google sign-in needs the owner's browser (the redirect URI
// must be registered at Google), see the A29 ticket.
//
//   node infra/scripts/verify-google-provider.mjs
//
// A33: the account here is registered with a password and never verified, so the emailed-link proof also removes its
// password and ends its sessions (checked below, and the password route is then re-armed through the admin API, as the
// user's "forgot password" would); a verified account keeps its password under the same proof. Needs the extensions JAR
// with the A33 change loaded.
//
// A33: a brand-new account from the provider starts email-verified when the provider says so (the `google-email-verified`
// mapper, applied to the stub the same way the script applies it to google), one the provider does not vouch for starts
// unverified, and an existing account the provider is linked to keeps whatever it had (the mapper only imports).
//
// Creates a user a29-<run>... and an identity provider a29stub-<run>, deleted at the end (also on failure). Exit code 1
// if any check fails. Same overrides as verify-email-normalized.mjs (the helpers below are copied from it) plus
// MAILPIT_URL (default http://localhost:8025).
import crypto from 'node:crypto';
import http from 'node:http';

import { ALIAS, LINK_LIFESPAN_KEY, LINK_LIFESPAN_SECONDS } from './realm-google-provider.mjs';
import { idpMapper as emailVerifiedMapper, MAPPER_NAME as EMAIL_VERIFIED_MAPPER } from './realm-google-email-verified.mjs';

const URL_BASE = process.env.KEYCLOAK_URL ?? 'http://localhost:8081';
const REALM = process.env.KEYCLOAK_REALM ?? 'sportconnect';
const OIDC = `${URL_BASE}/realms/${REALM}/protocol/openid-connect`;
const CLIENT_ID = 'sportconnect-web';
const REDIRECT_URI = 'http://localhost:5173/auth/callback'; // only has to be a registered redirect; nothing listens
const PASSWORD = 'A29-check-password-1';
const RUN = crypto.randomBytes(3).toString('hex');
const STUB_PORT = Number(process.env.STUB_PORT ?? 8099);
const STUB_FROM_KEYCLOAK = `http://${process.env.STUB_HOST_FOR_KEYCLOAK ?? 'host.docker.internal'}:${STUB_PORT}`;
const STUB_FROM_HERE = `http://localhost:${STUB_PORT}`;
const IDP = `a29stub-${RUN}`;

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
    body: new URLSearchParams({ firstName: 'A29', lastName: 'Check', password: PASSWORD, 'password-confirm': PASSWORD, ...fields }),
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

const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const loginActionOf = (html) => new URL(unescapeContext(html, 'loginAction'), URL_BASE).href;
const pageIdOf = (html) => /pageId = "([^"]+).ftl"/.exec(html)?.[1];
const formPost = (action, jar, fields) =>
  fetch(action, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookieHeader(jar) },
    body: new URLSearchParams(fields),
  });
const CREDENTIALS_CLIENT = { client_id: 'sportconnect-credentials', client_secret: process.env.KEYCLOAK_CREDENTIALS_CLIENT_SECRET ?? 'dev-credentials-client-secret' };
/** A33: a live SSO session for the user (a password grant by the backend-only client), returns whether it was opened. */
const openSession = async (username, password) =>
  (await fetch(`${OIDC}/token`, { method: 'POST', body: new URLSearchParams({ grant_type: 'password', username, password, ...CREDENTIALS_CLIENT }) })).ok;
const sessionIdsOf = async (id) => (await (await admin(`/users/${id}/sessions`)).json()).map((session) => session.id);
const hasPassword = async (id) => (await (await admin(`/users/${id}/credentials`)).json()).some((c) => c.type === 'password');
const setPassword = (id, value) => admin(`/users/${id}/reset-password`, { method: 'PUT', body: JSON.stringify({ type: 'password', value, temporary: false }) });
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

async function mailCount(address, since) {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const list = await (await fetch(`${MAILPIT}/api/v1/messages`)).json();
  return (list.messages ?? []).filter((m) => m.To?.some((t) => t.Address === address) && new Date(m.Created) >= since).length;
}

async function mailTo(address, since) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const list = await (await fetch(`${MAILPIT}/api/v1/messages`)).json();
    const found = (list.messages ?? []).find((m) => m.To?.some((t) => t.Address === address) && new Date(m.Created) >= since);
    if (found) return await (await fetch(`${MAILPIT}/api/v1/message/${found.ID}`)).json();
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}

const createStub = async (trustEmail) => {
  const created = await admin('/identity-provider/instances', {
    method: 'POST',
    body: JSON.stringify({
      alias: IDP,
      displayName: 'Google',
      providerId: 'oidc',
      enabled: true,
      trustEmail,
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

async function exchange(code, verifier) {
  const response = await fetch(`${OIDC}/token`, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: CLIENT_ID, code, code_verifier: verifier, redirect_uri: REDIRECT_URI }),
  });
  return response.ok ? await response.json() : null;
}

/** Like brokerLogin, but keeps the PKCE verifier so the code can be exchanged for tokens. */
async function brokerSession(identity) {
  nextIdentity = identity;
  const verifier = crypto.randomBytes(32).toString('base64url');
  const jar = new Map();
  const result = await follow(authUrl(verifier, `&kc_idp_hint=${IDP}`), jar);
  return { ...result, jar, verifier };
}

async function main() {
  if (!(await fetch(`${URL_BASE}/realms/${REALM}`)).ok) throw new Error(`no realm ${REALM} on ${URL_BASE}`);

  // 1. the Google provider as the script configures it
  const realm = await (await admin('')).json();
  check(`the link email lives ${Number(LINK_LIFESPAN_SECONDS) / 60} minutes`, realm.attributes?.[LINK_LIFESPAN_KEY] === LINK_LIFESPAN_SECONDS, String(realm.attributes?.[LINK_LIFESPAN_KEY]));
  const google = await admin(`/identity-provider/instances/${ALIAS}`);
  if (google.status === 200) {
    const idp = await google.json();
    check('google is a built-in Google provider', idp.providerId === 'google');
    check('google does not trust the email (an existing account is always proven, never silently linked)', idp.trustEmail === false, String(idp.trustEmail));
    check('google names no first-broker-login flow (the realm binding, the A35 flow, applies)', idp.firstBrokerLoginFlowAlias == null || idp.firstBrokerLoginFlowAlias === 'sportconnect first broker login', String(idp.firstBrokerLoginFlowAlias));
    const googleMappers = await (await admin(`/identity-provider/instances/${ALIAS}/mappers`)).json();
    check('google has the new-account email-verified mapper (apply-realm-google-email-verified.sh)', googleMappers.some((m) => m.name === EMAIL_VERIFIED_MAPPER && m.identityProviderMapper === 'sc-email-verified-importer' && m.config?.syncMode === 'IMPORT'), JSON.stringify(googleMappers.map((m) => m.name)));
    check('google asks for openid email profile', idp.config?.defaultScope === 'openid email profile', idp.config?.defaultScope);
    check('the secret is not readable back', idp.config?.clientSecret === '**********', 'secret exposed');
    const verifier = crypto.randomBytes(32).toString('base64url');
    const login = await fetch(authUrl(verifier));
    check('the login page offers the Google button when google is enabled', idp.enabled ? /"alias": "google"/.test(await login.text()) : true);
  } else {
    console.log('SKIP  google provider is not configured here (no Google OAuth client): provider checks skipped');
  }

  // 2. a password account, then a Google-like sign-in with another spelling of the same Gmail
  let oldSessions = [];
  const registered = `a29.${RUN}.shop@gmail.com`;
  const googleEmail = `a29${RUN}shop@gmail.com`;
  const reg = await register({ email: registered });
  check('a password account is registered', reg.ok, reg.html?.slice(0, 200));
  const account = await userByEmail(registered);
  check('the stub provider is created (trustEmail false)', (await createStub(false)) === 201);
  check('the email-verified mapper is added to the stub like google', (await admin(`/identity-provider/instances/${IDP}/mappers`, { method: 'POST', body: JSON.stringify(emailVerifiedMapper(IDP)) })).status === 201);

  const since = new Date(Date.now() - 2000);
  const first = await brokerSession({ sub: `g-${RUN}`, email: googleEmail, email_verified: true });
  check('page 1 is the account-already-exists confirmation', pageIdOf(first.html ?? '') === 'login-idp-link-confirm', pageIdOf(first.html ?? '') ?? first.text?.slice(0, 200));
  check('page 1 offers the account password and the email way, for the existing address', /"hasPassword":\s*true/.test(first.html ?? '') && /"emailAvailable":\s*true/.test(first.html ?? '') && (first.html ?? '').includes(registered), text(first.html ?? '').slice(0, 200));
  check('page 1 says the account was never verified (the warning shows)', /"unverified":\s*true/.test(first.html ?? ''), (first.html ?? '').slice(0, 100));
  check('the squatter-style account has a password and a live session before the proof', (await hasPassword(account.id)) && (await openSession(account.username, PASSWORD)) && (oldSessions = await sessionIdsOf(account.id)).length >= 1);
  check('nothing is linked before the user proves anything', (await (await admin(`/users/${account.id}/federated-identity`)).json()).length === 0);

  // 2a. "Verify by email" sends the proof email and shows the email-sent page
  const confirmed = await formPost(loginActionOf(first.html), first.jar, { linkMethod: 'email' });
  absorb(first.jar, confirmed);
  const sent = await confirmed.text();
  check('page 2 is the email-sent page', pageIdOf(sent) === 'login-idp-link-email', pageIdOf(sent) ?? text(sent).slice(0, 200));
  const wait = Number(/"resendIn":\s*(\d+)/.exec(sent)?.[1]);
  check('page 2 starts a 60 second resend wait', wait >= 55 && wait <= 60, String(wait));
  const mail = await mailTo(registered, since);
  check('the proof email went to the EXISTING account address', mail !== null);
  check('the email names the provider and the 30 minute lifetime', /Google/.test(mail?.Subject ?? '') && /30 minutes/.test(mail?.Text ?? ''), `${mail?.Subject} | ${mail?.Text?.slice(0, 300)}`);
  check('the email warns that an unverified account loses its current password', /never verified/.test(mail?.Text ?? '') && /password/.test(mail?.Text ?? ''), mail?.Text?.slice(0, 500));
  check('the email text is the SportConnect one, not the stock Keycloak wording', /SportConnect/.test(mail?.Text ?? '') && !/Someone wants to link/.test(mail?.Text ?? ''), mail?.Text?.slice(0, 200));
  check('still nothing linked after the email was only sent', (await (await admin(`/users/${account.id}/federated-identity`)).json()).length === 0);

  // 2b. a resend inside the minute is refused (no second email), the page stays
  const tooSoon = await formPost(loginActionOf(sent), first.jar, { linkMethod: 'resend' });
  absorb(first.jar, tooSoon);
  const tooSoonHtml = await tooSoon.text();
  check('a resend inside the minute shows the same page', pageIdOf(tooSoonHtml) === 'login-idp-link-email', pageIdOf(tooSoonHtml) ?? text(tooSoonHtml).slice(0, 200));
  check('and sends no second email', (await mailCount(registered, since)) === 1, String(await mailCount(registered, since)));

  // 2c. opening the emailed link links the accounts
  const link = /https?:\/\/\S*action-token\S*/.exec(mail?.Text ?? '')?.[0];
  check('the email carries the confirmation link', link !== undefined);
  if (link) {
    const done = await follow(link.replace('http://localhost:8081', URL_BASE), first.jar);
    const linked = await (await admin(`/users/${account.id}/federated-identity`)).json();
    check('opening the link linked the provider to the existing account', linked.length === 1 && linked[0].identityProvider === IDP, `${done.text?.slice(0, 200)} ${JSON.stringify(linked)}`);
    const users = await usersWhere(`search=a29`);
    const currentSessions = await sessionIdsOf(account.id);
    check('A33: the emailed-link proof on an unverified account removed its password', !(await hasPassword(account.id)));
    check('A33: and ended the sessions the account had (the new one is the sign-in just proven)', oldSessions.every((id) => !currentSessions.includes(id)), `${oldSessions} vs ${currentSessions}`);
    check('A33: and marked the email verified', (await userByEmail(registered))?.emailVerified === true);
    check('and no second account exists for that mailbox', users.filter((u) => (u.email ?? '').replaceAll('.', '').includes(`a29${RUN}shop`)).length === 1);
  }

  // 3. the same visitor again (provider unlinked): resend after the minute, and "Back to log in" with the email pre-filled
  await admin(`/users/${account.id}/federated-identity/${IDP}`, { method: 'DELETE' });
  const second = await brokerSession({ sub: `g2-${RUN}`, email: googleEmail, email_verified: true });
  const sentAt = new Date(Date.now() - 2000);
  const step1 = await formPost(loginActionOf(second.html), second.jar, { linkMethod: 'email' });
  absorb(second.jar, step1);
  const sentAgain = await step1.text();
  check('the second visit gets its own email', (await mailCount(registered, sentAt)) === 1, String(await mailCount(registered, sentAt)));
  if (!process.env.SKIP_RESEND_WAIT) {
    console.log('      (waiting 61 s for the resend to open)');
    await new Promise((resolve) => setTimeout(resolve, 61000));
    const resend = await formPost(loginActionOf(sentAgain), second.jar, { linkMethod: 'resend' });
    absorb(second.jar, resend);
    const resent = await resend.text();
    check('after the minute a resend sends a new email', pageIdOf(resent) === 'login-idp-link-email' && (await mailCount(registered, sentAt)) === 2, `${pageIdOf(resent)} ${await mailCount(registered, sentAt)}`);
  }
  const restartUrl = unescapeContext(sentAgain, 'loginRestartFlowUrl');
  check('the email-sent page has a way back to the login', restartUrl !== undefined);
  if (restartUrl) {
    const back = await follow(new URL(restartUrl, URL_BASE).href, second.jar);
    check('Back to log in lands on the login page with the email pre-filled', pageIdOf(back.html ?? '') === 'login' && (back.html ?? '').includes(`"username": "${registered}"`), `${pageIdOf(back.html ?? '')} ${text(back.html ?? '').slice(0, 200)}`);
  }

  // A33: the proof removed the password; the owner would set a new one with "forgot password". Done through the admin API.
  check('a new password can be set afterwards (the account is not locked out)', (await setPassword(account.id, PASSWORD)).ok);

  // 3b. the password way (new visitor, same mailbox): a wrong password stays on the page, the right one links
  const third = await brokerSession({ sub: `g4-${RUN}`, email: googleEmail, email_verified: true });
  const wrong = await formPost(loginActionOf(third.html), third.jar, { linkMethod: 'password', password: 'not-the-password' });
  absorb(third.jar, wrong);
  const wrongHtml = await wrong.text();
  check('a wrong password stays on the choice page with an error and links nothing', pageIdOf(wrongHtml) === 'login-idp-link-confirm' && /"type":\s*"error"/.test(wrongHtml) && (await (await admin(`/users/${account.id}/federated-identity`)).json()).length === 0, text(wrongHtml).slice(0, 200));
  const right = await formPost(loginActionOf(wrongHtml), third.jar, { linkMethod: 'password', password: PASSWORD });
  absorb(third.jar, right);
  let outcome = { code: null };
  const next = right.headers.get('location');
  if (next) outcome = await follow(new URL(next, URL_BASE).href, third.jar);
  const linked = await (await admin(`/users/${account.id}/federated-identity`)).json();
  check('the right password links the provider to the existing account', linked.length === 1 && linked[0].identityProvider === IDP, JSON.stringify(linked));
  if (outcome.code) {
    const tokens = await exchange(outcome.code, third.verifier);
    const claims = tokens ? claimsOf(tokens.access_token) : {};
    check('the token carries identity_provider (what A26 reads to reactivate a deactivated social user)', claims.identity_provider === IDP, JSON.stringify(Object.keys(claims)));
    check('the token subject is the existing account, not a new one', claims.sub === account.id, `${claims.sub} vs ${account.id}`);
  } else {
    check('the password route ends signed in', false, `no code; last page: ${outcome.text?.slice(0, 200)}`);
  }

  // 4. next time Google alone is enough (matched by the provider subject), and an unknown email just creates the account
  const again = await brokerSession({ sub: `g4-${RUN}`, email: googleEmail, email_verified: true });
  check('a linked Google sign-in goes straight in', again.code !== undefined && again.code !== null, again.text?.slice(0, 200));
  const fresh = await brokerSession({ sub: `g3-${RUN}`, email: `a29.${RUN}.fresh@outlook.com`, email_verified: true });
  check('an unknown email creates an account and goes in', fresh.code !== undefined && fresh.code !== null, fresh.text?.slice(0, 200));
  const freshUser = await userByEmail(`a29.${RUN}.fresh@outlook.com`);
  check('the new social user has email_normalized and a username (A27 / A35 rules hold for a provider)', Boolean(freshUser?.attributes?.email_normalized?.[0]) && Boolean(freshUser?.username), JSON.stringify(freshUser?.attributes));

  check('A33: a new account from a provider that vouches for the email starts verified', freshUser?.emailVerified === true, String(freshUser?.emailVerified));
  const unproven = await brokerSession({ sub: `g6-${RUN}`, email: `a33.${RUN}.unproven@outlook.com`, email_verified: false });
  const unprovenUser = await userByEmail(`a33.${RUN}.unproven@outlook.com`);
  check('A33: a new account from a provider that does not vouch starts unverified', unproven.code !== undefined && unproven.code !== null && unprovenUser?.emailVerified === false, `${unprovenUser?.emailVerified} ${unproven.text?.slice(0, 120)}`);

  // 4b. A33: linking to an EXISTING unverified account by its password does not verify it
  const pwlinkMail = `a33.${RUN}.pwlink@example.com`;
  check('a third password account is registered', (await register({ email: pwlinkMail })).ok);
  const pwlinkAccount = await userByEmail(pwlinkMail);
  const pw1 = await brokerSession({ sub: `g7-${RUN}`, email: pwlinkMail, email_verified: true });
  const pw2 = await formPost(loginActionOf(pw1.html), pw1.jar, { linkMethod: 'password', password: PASSWORD });
  absorb(pw1.jar, pw2);
  if (pw2.headers.get('location')) await follow(new URL(pw2.headers.get('location'), URL_BASE).href, pw1.jar);
  const pwLinked = await (await admin(`/users/${pwlinkAccount.id}/federated-identity`)).json();
  check('the password proof linked the provider', pwLinked.length === 1, JSON.stringify(pwLinked));
  check('A33: and left the existing account unverified (the provider is not asked about an account that already existed)', (await userByEmail(pwlinkMail))?.emailVerified === false, String((await userByEmail(pwlinkMail))?.emailVerified));
  check('A33: and kept its password', await hasPassword(pwlinkAccount.id));

  // 5. A33: an account that WAS verified keeps its password when the emailed link proves a Google sign-in
  const verifiedMail = `a33.${RUN}.verified@example.com`;
  const regVerified = await register({ email: verifiedMail });
  check('a second password account is registered', regVerified.ok, regVerified.html?.slice(0, 200));
  const verifiedAccount = await userByEmail(verifiedMail);
  await admin(`/users/${verifiedAccount.id}`, { method: 'PUT', body: JSON.stringify({ ...verifiedAccount, emailVerified: true }) });
  const sinceVerified = new Date(Date.now() - 2000);
  const v1 = await brokerSession({ sub: `g5-${RUN}`, email: verifiedMail, email_verified: true });
  check('page 1 does not warn for a verified account', pageIdOf(v1.html ?? '') === 'login-idp-link-confirm' && /"unverified":\s*false/.test(v1.html ?? ''), (v1.html ?? '').slice(0, 100));
  const v2 = await formPost(loginActionOf(v1.html), v1.jar, { linkMethod: 'email' });
  absorb(v1.jar, v2);
  await v2.text();
  const vMail = await mailTo(verifiedMail, sinceVerified);
  const vLink = /https?:\/\/\S*action-token\S*/.exec(vMail?.Text ?? '')?.[0];
  check('the proof email was sent for the verified account', vLink !== undefined);
  if (vLink) {
    await follow(vLink.replace('http://localhost:8081', URL_BASE), v1.jar);
    const vLinked = await (await admin(`/users/${verifiedAccount.id}/federated-identity`)).json();
    check('the verified account got the provider linked', vLinked.length === 1 && vLinked[0].identityProvider === IDP, JSON.stringify(vLinked));
    check('A33: and kept its password (it was verified before, so nothing was removed)', await hasPassword(verifiedAccount.id));
  }
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
  const mine = (await usersWhere('search=a29')).filter((u) => (u.email ?? '').replaceAll('.', '').toLowerCase().includes(`a29${RUN}`));
  for (const user of mine) await admin(`/users/${user.id}`, { method: 'DELETE' });
  console.log(`cleaned up ${mine.length} users`);
}
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
