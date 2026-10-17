// A27: live check of the phone rules against the dev Keycloak (the realm must have had apply-realm-phone-rules.sh run,
// with the provider JAR loaded). It drives the real registration and login pages over HTTP, so it exercises the
// validators, the normalising listener and the phone-login form exactly as a browser does.
//
//   node infra/scripts/verify-phone-rules.mjs
//
// Creates users named a27-<run>-*@example.test and deletes them at the end (also on failure). Exit code 1 if any check
// fails. Overrides: KEYCLOAK_URL (default http://localhost:8081), KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD (default
// admin/admin), KEYCLOAK_REALM (default sportconnect). Needs Node 18+.
import crypto from 'node:crypto';

const URL_BASE = process.env.KEYCLOAK_URL ?? 'http://localhost:8081';
const REALM = process.env.KEYCLOAK_REALM ?? 'sportconnect';
const OIDC = `${URL_BASE}/realms/${REALM}/protocol/openid-connect`;
const CLIENT_ID = 'sportconnect-web';
const REDIRECT_URI = 'http://localhost:5173/auth/callback'; // only has to be a registered redirect; nothing listens
const PASSWORD = 'A27-check-password-1';
const RUN = crypto.randomBytes(3).toString('hex');

const randomPhone = () => `090${String(crypto.randomInt(0, 10_000_000)).padStart(7, '0')}`;
const toE164 = (national) => `+84${national.slice(1)}`;

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
const admin = async (path, init = {}) => {
  const response = await fetch(`${URL_BASE}/admin/realms/${REALM}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await adminToken()}`, 'Content-Type': 'application/json' },
  });
  return response;
};
const usersWhere = async (query) => (await (await admin(`/users?${query}&briefRepresentation=false`)).json());

// --- scripted pages ------------------------------------------------------------------------------------------------
const absorb = (jar, response) => {
  for (const line of response.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';');
    const [name, ...rest] = pair.split('=');
    jar.set(name.trim(), rest.join('='));
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
};
const unescapeContext = (html, key) => {
  const raw = new RegExp(`"${key}":\\s*"([^"]+)"`).exec(html)?.[1];
  return raw === undefined ? undefined : JSON.parse(`"${raw}"`).replace(/&amp;/g, '&');
};

const authUrl = (verifier) => {
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return (
    `${OIDC}/auth?client_id=${CLIENT_ID}&response_type=code&scope=openid&code_challenge=${challenge}` +
    `&code_challenge_method=S256&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
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
  const page = await fetch(registrationUrl, { headers: { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } });
  absorb(jar, page);
  const action = new URL(unescapeContext(await page.text(), 'registrationAction'), URL_BASE).href;
  const submit = await fetch(action, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') },
    body: new URLSearchParams({ firstName: 'A27', lastName: 'Check', password: PASSWORD, 'password-confirm': PASSWORD, ...fields }),
  });
  if (codeFrom(submit)) return { ok: true };
  return { ok: false, html: (await submit.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') };
}

/** Signs in with whatever is typed in the username field; returns the access token claims or null. */
async function loginWith(typed, password = PASSWORD) {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const jar = new Map();
  const page = await fetch(authUrl(verifier));
  absorb(jar, page);
  const action = new URL(unescapeContext(await page.text(), 'loginAction'), URL_BASE).href;
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const submit = await fetch(action, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie() },
    body: new URLSearchParams({ username: typed, password, credentialId: '' }),
  });
  const code = codeFrom(submit);
  if (!code) return null;
  const token = await fetch(`${OIDC}/token`, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: CLIENT_ID, code, code_verifier: verifier, redirect_uri: REDIRECT_URI }),
  });
  const json = await token.json();
  return json.access_token ? JSON.parse(Buffer.from(json.access_token.split('.')[1], 'base64url').toString()) : null;
}

const email = (tag) => `a27-${RUN}-${tag}@example.test`;
const ALREADY_USED = /already used by another account/;
const NEEDS_IDENTIFIER = /email address or a valid phone number/;

async function main() {
  // 1. a phone typed in national form is stored as E.164, and the user can sign in by it in either form
  const phoneA = randomPhone();
  const a = await register({ email: email('a'), phoneNumber: phoneA });
  check('register with email + national phone succeeds', a.ok, a.html?.slice(0, 200));
  const [userA] = await usersWhere(`email=${encodeURIComponent(email('a'))}&exact=true`);
  check('email user keeps the email as username', userA?.username === email('a'), userA?.username);
  check('phone stored as E.164', userA?.attributes?.phoneNumber?.[0] === toE164(phoneA), JSON.stringify(userA?.attributes));
  const byNational = await loginWith(phoneA);
  check('sign in by the national phone gives a token', byNational?.email === email('a'), JSON.stringify(byNational));
  const byE164 = await loginWith(toE164(phoneA));
  check('sign in by the E.164 phone gives a token', byE164?.email === email('a'), JSON.stringify(byE164));
  check('sign in by email still works', (await loginWith(email('a')))?.email === email('a'));
  check('wrong password by phone is refused', (await loginWith(phoneA, 'wrong-password')) === null);

  // 2. unique phone, in any spelling of the same number
  const dup = await register({ email: email('dup'), phoneNumber: toE164(phoneA).replace('+84', '+84 ') });
  check('same phone in another spelling is refused', !dup.ok && ALREADY_USED.test(dup.html), dup.html?.slice(0, 200));

  // 3. neither email nor phone
  const none = await register({});
  check('neither email nor phone is refused', !none.ok && NEEDS_IDENTIFIER.test(none.html), none.html?.slice(0, 200));

  // 4. phone only: allowed, username is the E.164 number
  const phoneB = randomPhone();
  const b = await register({ phoneNumber: phoneB });
  check('register with a phone only succeeds', b.ok, b.html?.slice(0, 200));
  const [userB] = await usersWhere(`q=phoneNumber:${encodeURIComponent(toE164(phoneB))}`);
  check('phone-only user has the E.164 number as username', userB?.username === toE164(phoneB), JSON.stringify(userB));
  check('phone-only user signs in by phone', (await loginWith(phoneB))?.phone_number === toE164(phoneB));

  // 5. a phone that does not parse never blocks, is kept as typed and compared as typed
  const raw = `ext-${RUN}`;
  const c = await register({ email: email('c'), phoneNumber: raw });
  check('register with email + unparseable phone succeeds', c.ok, c.html?.slice(0, 200));
  const [userC] = await usersWhere(`email=${encodeURIComponent(email('c'))}&exact=true`);
  check('unparseable phone is stored as typed', userC?.attributes?.phoneNumber?.[0] === raw, JSON.stringify(userC?.attributes));
  const cDup = await register({ email: email('c2'), phoneNumber: raw });
  check('the same unparseable text is refused as taken', !cDup.ok && ALREADY_USED.test(cDup.html), cDup.html?.slice(0, 200));
  const cOnly = await register({ phoneNumber: `only-${RUN}` });
  check('an unparseable phone alone is not an identifier', !cOnly.ok && NEEDS_IDENTIFIER.test(cOnly.html), cOnly.html?.slice(0, 200));

  // 6. profile update through the admin API runs the same validators
  const phoneD = randomPhone();
  const d = await register({ email: email('d'), phoneNumber: phoneD });
  const [userD] = await usersWhere(`email=${encodeURIComponent(email('d'))}&exact=true`);
  const clash = await admin(`/users/${userD.id}`, {
    method: 'PUT',
    body: JSON.stringify({ ...userD, attributes: { ...userD.attributes, phoneNumber: [toE164(phoneA)] } }),
  });
  check('changing a phone to a taken one is refused (admin API)', d.ok && clash.status === 400, `status ${clash.status}`);
  const same = await admin(`/users/${userD.id}`, { method: 'PUT', body: JSON.stringify(userD) });
  check('saving a user with their own phone is not a clash', same.status === 204, `status ${same.status}`);
}

try {
  await main();
} catch (error) {
  failures += 1;
  console.error('FAIL  unexpected error', error);
} finally {
  const created = await usersWhere(`search=a27-${RUN}`);
  const phoneOnly = (await usersWhere('search=%2B84')).filter((u) => u.attributes?.phoneNumber?.[0] && u.firstName === 'A27' && !u.email);
  for (const user of [...created, ...phoneOnly]) await admin(`/users/${user.id}`, { method: 'DELETE' });
  console.log(`cleaned up ${created.length + phoneOnly.length} users`);
}
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
