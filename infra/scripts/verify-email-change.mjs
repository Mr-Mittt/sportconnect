// U26: live check of the email change, end to end: the real backend, the real dev Keycloak (the realm's registration flow,
// the A35 validator, editUsernameAllowed), Postgres, Redis and the Mailpit mail sink. Nothing is mocked.
//
//   infra/scripts/apply-realm-edit-username.sh        # once per realm (the change moves the Keycloak username)
//   ./gradlew :server:bootRun                          # the backend of THIS code, with the dev stack up
//   node infra/scripts/verify-email-change.mjs
//
// What it proves, in order: the duplicate rule on a real registered account (the exact address and the Gmail spellings),
// the same-address refusal, the code mailed to the new address, a wrong code and a wrong password changing nothing, and
// then a real change: the account holds the new address as verified in Keycloak and in the app, the username followed,
// the old address no longer signs in and can be registered by someone else, the Google link and picture are gone while
// the rest of the account stays, and a second change confirmed by the code mailed to the current address.
//
// Creates users u26live-<run>-... in Keycloak (deleted at the end, also on failure) and their rows in the backend's
// database: those rows stay, and the script prints the SQL that removes them. Exit code 1 if any check fails.
// Overrides: BACKEND_URL (default http://localhost:8080), KEYCLOAK_URL, KEYCLOAK_REALM, KEYCLOAK_ADMIN /
// KEYCLOAK_ADMIN_PASSWORD, KEYCLOAK_CREDENTIALS_CLIENT_SECRET, MAILPIT_URL.
import crypto from 'node:crypto';

const KC = process.env.KEYCLOAK_URL ?? 'http://localhost:8081';
const REALM = process.env.KEYCLOAK_REALM ?? 'sportconnect';
const API = process.env.BACKEND_URL ?? 'http://localhost:8080';
const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const OIDC = `${KC}/realms/${REALM}/protocol/openid-connect`;
const REDIRECT = 'http://localhost:5173/auth/callback';
const RUN = crypto.randomBytes(3).toString('hex');
const PASSWORD = 'U26-live-password-1';
const GOOGLE_PICTURE = 'https://lh3.googleusercontent.com/a/u26-live';
const CREDENTIALS = {
  client_id: 'sportconnect-credentials',
  client_secret: process.env.KEYCLOAK_CREDENTIALS_CLIENT_SECRET ?? 'dev-credentials-client-secret',
};

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const adminToken = async () => {
  const response = await fetch(`${KC}/realms/master/protocol/openid-connect/token`, {
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
  fetch(`${KC}/admin/realms/${REALM}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await adminToken()}`, 'Content-Type': 'application/json' },
  });
const kcUser = async (id) => (await admin(`/users/${id}`)).json();
const kcLinks = async (id) => (await admin(`/users/${id}/federated-identity`)).json();
const passwordGrant = async (username) =>
  (await fetch(`${OIDC}/token`, { method: 'POST', body: new URLSearchParams({ grant_type: 'password', ...CREDENTIALS, username, password: PASSWORD }) })).status;

const created = [];

/** Registers through the realm's own registration page (so the A35 key and the username are what a real user gets). */
async function register(email) {
  const jar = new Map();
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const absorb = (r) => {
    for (const line of r.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(';');
      const [name, ...value] = pair.split('=');
      jar.set(name.trim(), value.join('='));
    }
  };
  const ctx = (html, key) => {
    const raw = new RegExp(`"${key}":\\s*"([^"]+)"`).exec(html)?.[1];
    return raw === undefined ? undefined : JSON.parse(`"${raw}"`).replace(/&amp;/g, '&');
  };
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const auth = `${OIDC}/auth?client_id=sportconnect-web&response_type=code&scope=openid&code_challenge=${challenge}&code_challenge_method=S256&redirect_uri=${encodeURIComponent(REDIRECT)}`;
  const login = await fetch(auth);
  absorb(login);
  const regUrl = new URL(ctx(await login.text(), 'registrationUrl'), KC).href;
  const page = await fetch(regUrl, { headers: { Cookie: cookie() } });
  absorb(page);
  const action = new URL(ctx(await page.text(), 'registrationAction'), KC).href;
  const submit = await fetch(action, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie() },
    body: new URLSearchParams({ firstName: 'Live', lastName: 'Check', email, password: PASSWORD, 'password-confirm': PASSWORD }),
  });
  const location = submit.headers.get('location') ?? '';
  if (!location.startsWith(REDIRECT)) return { ok: false, status: submit.status, location };
  const found = (await (await admin(`/users?email=${encodeURIComponent(email)}&exact=true`)).json())[0];
  if (found) created.push(found.id);
  return { ok: true, id: found?.id, code: new URL(location).searchParams.get('code'), verifier };
}

/** The backend's sign-in: the code from the registration is exchanged, which creates the row in its database. */
async function signIn({ code, verifier }) {
  const response = await fetch(`${API}/api/auth/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, codeVerifier: verifier }),
  });
  const body = await response.json();
  if (response.status !== 200) throw new Error(`callback ${response.status}: ${JSON.stringify(body).slice(0, 200)}`);
  return body.data.accessToken;
}

const call = async (token, method, path, body) => {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};

/** The newest mail to `address` that arrived after `since`, as its text. */
async function mailTo(address, since) {
  for (let i = 0; i < 20; i += 1) {
    const list = await (await fetch(`${MAILPIT}/api/v1/messages`)).json();
    const found = (list.messages ?? []).find((m) => m.To?.some((t) => t.Address === address) && new Date(m.Created) >= since);
    if (found) return (await (await fetch(`${MAILPIT}/api/v1/message/${found.ID}`)).json()).Text ?? '';
    await sleep(500);
  }
  return null;
}
/** Whether a confirmation-code mail to one of the addresses arrived after `since` (one look; the welcome mail is not one). */
async function anyMailTo(addresses, since) {
  await sleep(1500);
  const list = await (await fetch(`${MAILPIT}/api/v1/messages`)).json();
  return (list.messages ?? []).some((m) => new Date(m.Created) >= since && /confirmation code/i.test(m.Subject) && m.To?.some((t) => addresses.includes(t.Address)));
}
const digits = (text) => /\b(\d{6})\b/.exec(text ?? '')?.[1];

try {
  const subjectMail = `u26live-${RUN}-a@example.com`;
  const holderMail = `u26live${RUN}h@gmail.com`;
  const newMail = `u26live-${RUN}-b@example.com`;
  const finalMail = `u26live-${RUN}-c@example.com`;

  // two real accounts: the subject, and a holder of a Gmail mailbox
  const holder = await register(holderMail);
  check('the holder of a Gmail mailbox is registered through the realm flow', holder.ok, JSON.stringify(holder));
  const subject = await register(subjectMail);
  check('the subject account is registered through the realm flow', subject.ok, JSON.stringify(subject));
  const stored = await kcUser(subject.id);
  check('Keycloak keeps the A35 key and the email as the username for a registered account',
    stored.attributes?.email_normalized?.[0] === subjectMail && stored.username === subjectMail, JSON.stringify(stored.attributes) + stored.username);

  const token = await signIn(subject);
  // dress the account as a Google user: a link, a picture attribute, a Google picture as the avatar
  await admin(`/users/${subject.id}/federated-identity/google`, { method: 'POST', body: JSON.stringify({ userId: `g-${RUN}`, userName: 'x' }) });
  await admin(`/users/${subject.id}`, { method: 'PUT', body: JSON.stringify({ ...stored, attributes: { ...stored.attributes, picture: [GOOGLE_PICTURE] } }) });
  const profile = await call(token, 'PUT', `/api/users/${subject.id}/profile`, { avatarUrl: GOOGLE_PICTURE });
  check('the account has a Google link, a picture attribute and a Google avatar', profile.status === 200 && (await kcLinks(subject.id)).length === 1, JSON.stringify(profile.body).slice(0, 200));

  // ---- step 1: the checks on the address
  const startedAt = new Date(Date.now() - 2000);
  const refused = [];
  for (const [label, address] of [
    ['the exact address of another account', holderMail],
    ['a dotted Gmail spelling of that mailbox', `u26live${RUN}.h@gmail.com`],
    ['a +tag spelling', `u26live${RUN}h+shop@gmail.com`],
    ['a googlemail.com spelling', `u26live${RUN}h@googlemail.com`],
  ]) {
    refused.push(address);
    const taken = await call(token, 'POST', '/api/users/me/email-change-code', { newEmail: address });
    check(`${label} is refused: 409 EMAIL_ALREADY_REGISTERED`, taken.status === 409 && taken.body.errorCode === 'EMAIL_ALREADY_REGISTERED', `${taken.status} ${JSON.stringify(taken.body)}`);
  }
  refused.push(subjectMail);
  const same = await call(token, 'POST', '/api/users/me/email-change-code', { newEmail: subjectMail.toUpperCase() });
  check('the account\'s own address is refused: 400 NEW_EMAIL_SAME_AS_CURRENT', same.status === 400 && same.body.errorCode === 'NEW_EMAIL_SAME_AS_CURRENT', `${same.status} ${JSON.stringify(same.body)}`);
  check('no confirmation code was mailed to any refused address', !(await anyMailTo(refused, startedAt)), refused.join(' '));

  // ---- the code to the new address
  const sentAt = new Date(Date.now() - 2000);
  const asked = await call(token, 'POST', '/api/users/me/email-change-code', { newEmail: newMail });
  check('a free address gets a code: 200 with the countdown', asked.status === 200 && asked.body.data?.resendAfterSeconds === 60 && asked.body.data?.expiresInSeconds === 900, JSON.stringify(asked.body));
  const code = digits(await mailTo(newMail, sentAt));
  check('the code was mailed to the NEW address', Boolean(code));
  const tooSoon = await call(token, 'POST', '/api/users/me/email-change-code', { newEmail: newMail });
  check('another request inside the minute: 429 VERIFICATION_RESEND_TOO_SOON', tooSoon.status === 429 && tooSoon.body.errorCode === 'VERIFICATION_RESEND_TOO_SOON', JSON.stringify(tooSoon.body));

  // ---- refusals change nothing
  const untouched = async (what) => {
    const user = await kcUser(subject.id);
    const me = (await call(token, 'GET', '/api/users/me')).body.data;
    check(`${what}: nothing changed in Keycloak or the app`,
      user.email === subjectMail && user.username === subjectMail && me.email === subjectMail && (await kcLinks(subject.id)).length === 1,
      `${user.email} ${user.username} ${me.email}`);
  };
  const wrongCode = await call(token, 'PUT', '/api/users/me/email', { newEmail: newMail, newEmailCode: code === '000000' ? '000001' : '000000', currentPassword: PASSWORD });
  check('a wrong code: 400 VERIFICATION_CODE_INVALID', wrongCode.status === 400 && wrongCode.body.errorCode === 'VERIFICATION_CODE_INVALID', JSON.stringify(wrongCode.body));
  await untouched('after the wrong code');
  const wrongPassword = await call(token, 'PUT', '/api/users/me/email', { newEmail: newMail, newEmailCode: code, currentPassword: 'not-the-password' });
  check('a wrong password: 400 CURRENT_PASSWORD_INCORRECT', wrongPassword.status === 400 && wrongPassword.body.errorCode === 'CURRENT_PASSWORD_INCORRECT', JSON.stringify(wrongPassword.body));
  await untouched('after the wrong password');
  const otherAddress = await call(token, 'PUT', '/api/users/me/email', { newEmail: `u26live-${RUN}-z@example.com`, newEmailCode: code, currentPassword: PASSWORD });
  check('the code mailed to one address does not change the email to another', otherAddress.status === 400 && otherAddress.body.errorCode === 'VERIFICATION_CODE_INVALID', JSON.stringify(otherAddress.body));
  await untouched('after the code for another address');

  // ---- the change
  const changed = await call(token, 'PUT', '/api/users/me/email', { newEmail: newMail, newEmailCode: code, currentPassword: PASSWORD });
  check('the change with the right password and code: 200', changed.status === 200, JSON.stringify(changed.body));
  const after = await kcUser(subject.id);
  check('Keycloak: the new email, verified', after.email === newMail && after.emailVerified === true, `${after.email} ${after.emailVerified}`);
  check('Keycloak: the username followed the email', after.username === newMail, after.username);
  check('Keycloak: the A35 key is the new address\'s, and the Google picture attribute is gone',
    after.attributes?.email_normalized?.[0] === newMail && after.attributes?.picture === undefined, JSON.stringify(after.attributes));
  check('Keycloak: the Google link is removed', (await kcLinks(subject.id)).length === 0);
  const me = (await call(token, 'GET', '/api/users/me')).body.data;
  check('the app: the new email, verified, and the Google avatar cleared', me.email === newMail && me.isEmailVerified === true && !me.avatarUrl, JSON.stringify({ e: me.email, v: me.isEmailVerified, a: me.avatarUrl }));
  check('the old address no longer signs in (password grant: 401)', (await passwordGrant(subjectMail)) === 401);
  check('the new address signs in (password grant: 200)', (await passwordGrant(newMail)) === 200);
  const reused = await register(subjectMail);
  check('the old address is free: someone else can register it', reused.ok, JSON.stringify(reused));
  const spent = await call(token, 'PUT', '/api/users/me/email', { newEmail: newMail, newEmailCode: code, currentPassword: PASSWORD });
  check('a spent code or the same address is refused', spent.status === 400, JSON.stringify(spent.body));

  // ---- a second change, proven with the code mailed to the CURRENT address
  // (a new-address code can be asked for once a minute, so the second round waits the lock out)
  console.log('waiting 61 s for the resend lock of the new-address code...');
  await sleep(61000);
  const ownAt = new Date(Date.now() - 2000);
  const own = await call(token, 'POST', '/api/users/me/confirmation-code', { purpose: 'CHANGE_EMAIL' });
  const ownCode = digits(await mailTo(newMail, ownAt));
  check('the CHANGE_EMAIL proof code goes to the current address', own.status === 200 && Boolean(ownCode), JSON.stringify(own.body));
  const freshAt = new Date(Date.now() - 2000);
  const asked2 = await call(token, 'POST', '/api/users/me/email-change-code', { newEmail: finalMail });
  const code2 = digits(await mailTo(finalMail, freshAt));
  check('a code for the next address is mailed to it', asked2.status === 200 && Boolean(code2), JSON.stringify(asked2.body));
  const second = await call(token, 'PUT', '/api/users/me/email', { newEmail: finalMail, newEmailCode: code2, verificationCode: ownCode });
  const after2 = await kcUser(subject.id);
  check('the second change, proven with the emailed code: email and username moved again',
    second.status === 200 && after2.email === finalMail && after2.username === finalMail && after2.emailVerified === true, `${second.status} ${after2.email} ${after2.username}`);
} catch (error) {
  failures += 1;
  console.log(`FAIL  the check itself stopped: ${error.stack ?? error}`);
} finally {
  const doomed = new Set(created);
  for (const user of await (await admin(`/users?search=u26live&max=100`)).json().catch(() => [])) doomed.add(user.id);
  let removed = 0;
  for (const id of doomed) if ((await admin(`/users/${id}`, { method: 'DELETE' })).status === 204) removed += 1;
  console.log(`cleaned up ${removed} Keycloak users`);
  console.log(`the backend's rows remain; remove them with:\n  DELETE FROM user_preferences WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'u26live%');\n  DELETE FROM users WHERE email LIKE 'u26live%';`);
}
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
