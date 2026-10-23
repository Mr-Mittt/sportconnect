// A33: live check of the manual verification email, the way the backend asks for it (the backend-only client's service
// account calling the admin send-verify-email endpoint with a client, a redirect and a lifespan), against the dev Keycloak
// (Mailpit on :8025, the email theme mounted). Verification is an optional step: the check proves an unverified password
// account signs in as normal, that the mail is the themed one in the user's language and links back to the web app, and
// that opening the link is what sets emailVerified.
//
//   node infra/scripts/verify-email-verification.mjs
//
// Creates users a33-<run>-... (deleted at the end, also on failure). Exit code 1 if any check fails. Overrides:
// KEYCLOAK_URL, KEYCLOAK_REALM, KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD, KEYCLOAK_CREDENTIALS_CLIENT_SECRET, MAILPIT_URL.
import crypto from 'node:crypto';

const URL_BASE = process.env.KEYCLOAK_URL ?? 'http://localhost:8081';
const REALM = process.env.KEYCLOAK_REALM ?? 'sportconnect';
const OIDC = `${URL_BASE}/realms/${REALM}/protocol/openid-connect`;
const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const RUN = crypto.randomBytes(3).toString('hex');
const PASSWORD = 'A33-check-password-1';
const CREDENTIALS = {
  client_id: 'sportconnect-credentials',
  client_secret: process.env.KEYCLOAK_CREDENTIALS_CLIENT_SECRET ?? 'dev-credentials-client-secret',
};
const WEB_APP = 'http://localhost:5173/';
const LIFESPAN = 12 * 60 * 60;

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`);
};

const adminToken = async () => {
  const response = await fetch(`${OIDC.replace(REALM, 'master')}/token`, {
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

/** The backend's own token: the credentials client's service account. */
const serviceToken = async () => {
  const response = await fetch(`${OIDC}/token`, { method: 'POST', body: new URLSearchParams({ grant_type: 'client_credentials', ...CREDENTIALS }) });
  if (!response.ok) throw new Error(`service token failed: ${response.status}`);
  return (await response.json()).access_token;
};

const created = [];
async function createUser(suffix, locale) {
  const email = `a33.${RUN}.${suffix}@example.com`;
  const response = await admin('/users', {
    method: 'POST',
    body: JSON.stringify({
      username: `a33${RUN}${suffix}`,
      email,
      firstName: 'A33',
      lastName: 'Check',
      enabled: true,
      emailVerified: false,
      attributes: locale ? { locale: [locale] } : {},
      credentials: [{ type: 'password', value: PASSWORD, temporary: false }],
    }),
  });
  if (response.status !== 201) throw new Error(`create user failed: ${response.status} ${await response.text()}`);
  const id = response.headers.get('location').split('/').pop();
  created.push(id);
  return { id, email, username: `a33${RUN}${suffix}` };
}
const reload = async (id) => (await admin(`/users/${id}`)).json();
const signIn = (username) => fetch(`${OIDC}/token`, { method: 'POST', body: new URLSearchParams({ grant_type: 'password', username, password: PASSWORD, ...CREDENTIALS }) });

async function mailTo(address, since) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const list = await (await fetch(`${MAILPIT}/api/v1/messages`)).json();
    const found = (list.messages ?? []).find((m) => m.To?.some((t) => t.Address === address) && new Date(m.Created) >= since);
    if (found) return await (await fetch(`${MAILPIT}/api/v1/message/${found.ID}`)).json();
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}

/** What the backend does: PUT send-verify-email as the service account, with the web app as the way back. */
async function requestMail(id) {
  const query = new URLSearchParams({ client_id: 'sportconnect-web', redirect_uri: WEB_APP, lifespan: String(LIFESPAN) });
  return fetch(`${URL_BASE}/admin/realms/${REALM}/users/${id}/send-verify-email?${query}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${await serviceToken()}` },
  });
}

async function main() {
  if (!(await fetch(`${URL_BASE}/realms/${REALM}`)).ok) throw new Error(`no realm ${REALM} on ${URL_BASE}`);

  const realm = await (await admin('')).json();
  check('the realm does not require verification (it is optional)', realm.verifyEmail === false, String(realm.verifyEmail));

  // 1. an unverified password account works as normal
  const user = await createUser('en', 'en');
  check('a new password account starts unverified', (await reload(user.id)).emailVerified === false);
  check('and signs in as normal while unverified', (await signIn(user.username)).ok);

  // 2. the backend asks for the mail
  const since = new Date(Date.now() - 2000);
  const sent = await requestMail(user.id);
  check('the service account may ask for the verification email (204)', sent.status === 204, `${sent.status} ${await sent.text()}`);
  const mail = await mailTo(user.email, since);
  check('the mail arrived at the account address', mail !== null);
  check('it is the themed SportConnect verification mail', /Verify your email - SportConnect/.test(mail?.Subject ?? ''), mail?.Subject);
  const link = /https?:\/\/\S*action-token\S*/.exec(mail?.Text ?? '')?.[0]?.replace(/[)>.,]+$/, '');
  check('the mail carries the verification link', link !== undefined);
  const expiry = /expire within (\d+) (\w+)/.exec(mail?.Text ?? '');
  check('the link lives 12 hours (the lifespan the backend sends)', expiry?.[1] === '12' && /hour/.test(expiry?.[2] ?? ''), expiry?.[0] ?? mail?.Text?.slice(0, 300));
  check('nothing is verified before the link is opened', (await reload(user.id)).emailVerified === false);

  // 3. opening the link asks to confirm (an admin-sent link has no browser session), proceeding verifies and links back
  if (link) {
    const opened = await fetch(link.replace('http://localhost:8081', URL_BASE));
    const confirmPage = await opened.text();
    check('opening the link first asks the user to confirm the address', /Confirm validity of e-mail address/.test(confirmPage), confirmPage.slice(0, 200));
    check('and does not verify yet', (await reload(user.id)).emailVerified === false);
    const proceed = /"actionUri":\s*"([^"]+)"/.exec(confirmPage)?.[1]?.replace(/&amp;/g, '&');
    // the confirm step belongs to the browser session the first request opened
    const cookie = (opened.headers.getSetCookie?.() ?? []).map((line) => line.split(';')[0]).join('; ');
    const done = proceed ? await fetch(proceed.replace('http://localhost:8081', URL_BASE), { headers: { Cookie: cookie } }) : null;
    const donePage = done ? await done.text() : '';
    check('proceeding sets emailVerified', (await reload(user.id)).emailVerified === true, `${done?.status} ${donePage.slice(0, 200)}`);
    check('the page leads back to the web app', donePage.includes(WEB_APP), donePage.slice(0, 300));
  }
  check('a verified account still signs in', (await signIn(user.username)).ok);

  // 4. the mail follows the user's language
  const vi = await createUser('vi', 'vi');
  const sinceVi = new Date(Date.now() - 2000);
  check('a Vietnamese account can ask too', (await requestMail(vi.id)).status === 204);
  const viMail = await mailTo(vi.email, sinceVi);
  check('and gets the Vietnamese mail', /Xác minh/i.test(viMail?.Subject ?? ''), viMail?.Subject);

  // 5. no email: Keycloak refuses (the backend turns this into VERIFICATION_EMAIL_UNAVAILABLE)
  const bare = await admin('/users', { method: 'POST', body: JSON.stringify({ username: `a33${RUN}bare`, enabled: true, firstName: 'A', lastName: 'B' }) });
  if (bare.status === 201) {
    const bareId = bare.headers.get('location').split('/').pop();
    created.push(bareId);
    const refused = await requestMail(bareId);
    check('an account with no email is refused with 400', refused.status === 400, String(refused.status));
  } else {
    console.log(`SKIP  could not create an email-less user here (${bare.status}): the 400 check is skipped`);
  }
}

try {
  await main();
} catch (error) {
  failures += 1;
  console.error('FAIL  unexpected error', error);
} finally {
  for (const id of created) await admin(`/users/${id}`, { method: 'DELETE' }).catch(() => {});
  console.log(`cleaned up ${created.length} users`);
}
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
