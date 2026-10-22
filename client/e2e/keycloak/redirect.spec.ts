import { expect, test } from '@playwright/test';
import {
  allowClientOrigin,
  createTestUser,
  deleteUserByUsername,
  ensureIdentityProvider,
  getUserAttributes,
  type TestUser,
} from './keycloakAdmin.ts';

/*
 * AUTH-15: the client's Keycloak redirect (AUTH-14) against a real Keycloak running the SportConnect
 * theme. Run through infra/scripts/run-keycloak-e2e.sh (or `pnpm e2e:keycloak` with a Keycloak up).
 * Real: the redirect and PKCE request, Keycloak's hosted pages and the code it issues, the theme.
 * Mocked: `/api/*` (no Spring here), so the callback exchange is the mock server's — see
 * playwright.keycloak.config.ts. Every spec in e2e/flows signs in through e2e/mocks/keycloakStub.ts
 * instead and does not need Keycloak.
 */

const KEYCLOAK_PAGE = /\/realms\/sportconnect\/protocol\/openid-connect\/auth/;
const created: TestUser[] = [];
let user: TestUser;

test.beforeAll(async () => {
  await allowClientOrigin('http://localhost:5175');
  user = await createTestUser('signin');
  created.push(user);
  await ensureIdentityProvider('google', 'Google');
  await ensureIdentityProvider('facebook', 'Facebook');
  await ensureIdentityProvider('zalo', 'Zalo');
});

// AUTH-16: the mock backend's profile has no country, so the app would open its "complete your profile"
// dialog right after every sign-in and cover the page these specs look at (it has its own flow spec in
// e2e/flows/complete-profile.spec.ts). Skip it for the session, as signIn() does for the other specs.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem(
        'complete-profile-storage',
        JSON.stringify({ state: { skippedFor: '11111111-1111-4111-8111-111111111111' }, version: 0 }),
      );
    } catch {
      // sessionStorage unavailable on this origin: nothing to skip with
    }
  });
});

test.afterAll(async () => {
  for (const { username } of created) await deleteUserByUsername(username);
});

test('a protected deep link lands on the themed sign-in page with the three provider buttons', async ({
  page,
}) => {
  await page.goto('/groups');
  await page.waitForURL(KEYCLOAK_PAGE);

  const url = new URL(page.url());
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(url.searchParams.get('client_id')).toBe('sportconnect-web');

  // The theme: our card, heading and tagline, not Keycloak's stock page.
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByText('Your teams, matches, and crew')).toBeVisible();
  // The field is labelled "Email" (the username is internal; phone wording waits for AUTH-18).
  await expect(page.locator('label[for="username"]')).toHaveText('Email');
  await expect(page.getByRole('link', { name: 'Continue with Google' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue with Facebook' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue with Zalo' })).toBeVisible();
  // Keycloak's own default CSS is off: the page takes the client's design tokens.
  const background = await page.evaluate("getComputedStyle(document.body).backgroundColor");
  expect(background).toBe('rgb(247, 247, 244)');
});

test('the earth illustration is served from the theme resources (no 404)', async ({ page }) => {
  const failed: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
  });
  await page.goto('/login');
  await page.waitForURL(KEYCLOAK_PAGE);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(failed.filter((entry) => /earth|\.png|\.css|\.js/.test(entry))).toEqual([]);
});

test('signing in returns to the deep link through /auth/callback', async ({ page }) => {
  await page.goto('/groups');
  await page.waitForURL(KEYCLOAK_PAGE);
  await page.locator('#username').fill(user.username);
  await page.locator('#password').fill(user.password);
  await page.locator('#kc-login').click();

  await page.waitForURL('**/groups');
  await expect(page.getByRole('button', { name: 'Your account' })).toBeVisible();
});

test('a wrong password shows the themed error in the card', async ({ page }) => {
  await page.goto('/login');
  await page.waitForURL(KEYCLOAK_PAGE);
  await page.locator('#username').fill(user.username);
  await page.locator('#password').fill('not-the-password');
  await page.locator('#kc-login').click();

  await expect(page.getByRole('alert')).toContainText('Invalid username or password');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page).toHaveURL(/login-actions\/authenticate/);
});

test('/register opens the themed create-account form and registering returns to the app', async ({
  page,
}) => {
  await page.goto('/register');
  await page.waitForURL(KEYCLOAK_PAGE);
  expect(new URL(page.url()).searchParams.get('prompt')).toBe('create');
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();

  const stamp = `${Date.now()}`;
  const email = `e2e-register-${stamp}@example.test`;
  // The register page has no username field; the A27 registration step sets the username to the email.
  const registered: TestUser = {
    username: email,
    email,
    password: `Pw-${stamp}-aA1!`,
  };
  created.push(registered);
  await expect(page.locator('#username')).toHaveCount(0);
  // The email comes first, then the password fields, then the names and the rest.
  expect(
    await page.locator('#kc-register-form input:not([type=hidden])').evaluateAll((els) => els.map((e) => e.id).slice(0, 3)),
  ).toEqual(['email', 'password', 'password-confirm']);
  await page.locator('#email').fill(registered.email);
  await page.locator('#firstName').fill('E2E');
  await page.locator('#lastName').fill('Registered');
  await page.locator('#password').fill(registered.password);
  await page.locator('#password-confirm').fill(registered.password);

  // AUTH-16: the zone block replaces the four plain text boxes of the A32 attributes. Its lists come
  // from the (mock) reference API across origins, and the choice is posted as the user attributes.
  await expect(page.getByLabel('Latitude')).toHaveCount(0);
  await expect(page.getByLabel('Longitude')).toHaveCount(0);
  await page.locator('#kc-geo-country').selectOption({ label: 'Vietnam' });
  await page.locator('#kc-geo-region').selectOption({ label: 'Hồ Chí Minh' });

  await page.getByRole('button', { name: 'Create an account' }).click();

  await page.waitForURL('**/');
  await expect(page.getByRole('button', { name: 'Your account' })).toBeVisible();

  // The country and region ids Keycloak now holds for the new user are the mock reference rows (VN = 1,
  // Ho Chi Minh City = 102); A32 turns them into token claims.
  const attributes = await getUserAttributes(registered.username);
  expect(attributes.countryId).toEqual(['1']);
  expect(attributes.regionId).toEqual(['102']);
  expect(attributes.latitude).toBeUndefined();
});

test('the zone block is optional: registering without choosing one still works', async ({ page }) => {
  await page.goto('/register');
  await page.waitForURL(KEYCLOAK_PAGE);

  const stamp = `${Date.now()}`;
  const email = `e2e-nozone-${stamp}@example.test`;
  const registered: TestUser = { username: email, email, password: `Pw-${stamp}-aA1!` };
  created.push(registered);
  await page.locator('#email').fill(registered.email);
  await page.locator('#firstName').fill('E2E');
  await page.locator('#lastName').fill('NoZone');
  await page.locator('#password').fill(registered.password);
  await page.locator('#password-confirm').fill(registered.password);
  // The silent pre-fill may have chosen a country from the browser's language and time zone; clear it.
  await page.locator('#kc-geo-country').selectOption('');
  await page.getByRole('button', { name: 'Create an account' }).click();

  await page.waitForURL('**/');
  await expect(page.getByRole('button', { name: 'Your account' })).toBeVisible();
  const attributes = await getUserAttributes(registered.username);
  expect(attributes.countryId).toBeUndefined();
  expect(attributes.regionId).toBeUndefined();
});

test('the realm password policy (length 8, from the realm file) refuses a 7-character password on register', async ({ page }) => {
  await page.goto('/register');
  await page.waitForURL(KEYCLOAK_PAGE);

  await page.locator('#email').fill(`e2e-policy-${Date.now()}@example.test`);
  await page.locator('#firstName').fill('E2E');
  await page.locator('#lastName').fill('Policy');
  const submit = page.getByRole('button', { name: 'Create an account' });

  await page.locator('#password').fill('abcdefg');
  await page.locator('#password-confirm').fill('abcdefg');
  await page.locator('#password-confirm').blur();
  await expect(page.getByText('Invalid password: minimum length 8.')).toBeVisible();
  await expect(submit).toBeDisabled();

  await page.locator('#password').fill('abcdefgh');
  await page.locator('#password-confirm').fill('abcdefgh');
  await expect(page.getByText('Invalid password: minimum length 8.')).toBeHidden();
  await expect(submit).toBeEnabled();
});

test('"Forgot password?" opens the themed reset page', async ({ page }) => {
  await page.goto('/login');
  await page.waitForURL(KEYCLOAK_PAGE);
  await page.getByRole('link', { name: 'Forgot password?' }).click();

  await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible();
  await expect(page.locator('#username')).toBeVisible();
  await expect(page.getByRole('link', { name: /Back to log in/ })).toBeVisible();
});

test.describe('Vietnamese', () => {
  // navigator.languages = vi-VN, so the client sends ui_locales=vi (A24 finding 3, verified here).
  test.use({ locale: 'vi-VN' });

  test('ui_locales=vi opens the sign-in page in Vietnamese', async ({ page }) => {
    await page.goto('/login');
    await page.waitForURL(KEYCLOAK_PAGE);
    expect(new URL(page.url()).searchParams.get('ui_locales')).toBe('vi');

    await expect(page.getByRole('heading', { name: 'Chào mừng trở lại' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Đăng nhập' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Tiếp tục với Google' })).toBeVisible();
  });

  test('a wrong password is answered in Vietnamese by Keycloak itself (server-side message)', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.waitForURL(KEYCLOAK_PAGE);
    await page.locator('#username').fill(user.username);
    await page.locator('#password').fill('not-the-password');
    await page.locator('#kc-login').click();

    // `invalidUserMessage` is rendered by Keycloak from the messages_vi.properties the theme build
    // generates (messages_vi.ts); without it this would be the English default.
    await expect(page.getByRole('alert')).toContainText('Email hoặc mật khẩu không đúng');
  });

  test('the register page is Vietnamese too, including the profile field labels', async ({ page }) => {
    await page.goto('/register');
    await page.waitForURL(KEYCLOAK_PAGE);

    await expect(page.getByRole('heading', { name: 'Tạo tài khoản của bạn' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Tên đăng nhập')).toHaveCount(0);
    await expect(page.getByLabel('Họ', { exact: false }).first()).toBeVisible();
    // AUTH-16: the zone block, in Vietnamese.
    await expect(page.getByLabel('Quốc gia')).toBeVisible();
    await expect(page.getByLabel('Khu vực')).toBeVisible();
  });
});
