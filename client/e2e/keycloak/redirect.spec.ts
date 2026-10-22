import { expect, test } from '@playwright/test';
import {
  allowClientOrigin,
  createTestUser,
  deleteUserByUsername,
  ensureIdentityProvider,
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
  // The realm uses email as username: the register page has no username field and Keycloak stores the email.
  const registered: TestUser = {
    username: email,
    email,
    password: `Pw-${stamp}-aA1!`,
  };
  created.push(registered);
  await expect(page.locator('#username')).toHaveCount(0);
  await page.locator('#email').fill(registered.email);
  await page.locator('#firstName').fill('E2E');
  await page.locator('#lastName').fill('Registered');
  await page.locator('#password').fill(registered.password);
  await page.locator('#password-confirm').fill(registered.password);
  await page.getByRole('button', { name: 'Create an account' }).click();

  await page.waitForURL('**/');
  await expect(page.getByRole('button', { name: 'Your account' })).toBeVisible();
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
  });
});
