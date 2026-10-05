import { mockTakenEmail, mockUser } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * CLIENT-ERR-2: the auth forms' server errors, localized from the error code, end to end. The auth
 * handler (e2e/mocks/handlers/auth.ts) mirrors the real codes: 409 EMAIL_ALREADY_REGISTERED for
 * `mockTakenEmail`, 401 INVALID_CREDENTIALS for a wrong login, 400 VALIDATION_FAILED with
 * `errorParams.fields` for a blank-after-trim register field (an 8-space password passes the form's
 * own length rule). Behavior table: client/docs/MVP/CLIENT-ERR-2_AUTH_ERROR_ADAPTATION.md.
 */

async function useVietnamese(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    localStorage.setItem('locale-storage', JSON.stringify({ state: { locale: 'vi' }, version: 0 }));
  });
}

test.describe('register', () => {
  test('a duplicate email shows localized copy and a "Sign in instead" link, keeping the input', async ({ page }) => {
    await page.goto('/register');
    await page.locator('#register-email').fill(mockTakenEmail);
    await page.locator('#register-password').fill('password123');
    await page.locator('#register-full-name').fill('New Player');
    await page.getByRole('button', { name: 'Create account' }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toContainText('An account with this email already exists.');
    await expect(page).toHaveURL('/register');
    await expect(page.locator('#register-email')).toHaveValue(mockTakenEmail);

    await alert.getByRole('link', { name: 'Sign in instead' }).click();
    await expect(page).toHaveURL('/login');
  });

  test('a duplicate email in vi', async ({ page }) => {
    await useVietnamese(page);
    await page.goto('/register');
    await page.locator('#register-email').fill(mockTakenEmail);
    await page.locator('#register-password').fill('password123');
    await page.locator('#register-full-name').fill('Người Chơi');
    await page.getByRole('button', { name: 'Tạo tài khoản' }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Đã có tài khoản dùng email này.');
    await expect(alert.getByRole('link', { name: 'Đăng nhập ngay' })).toBeVisible();
  });

  test('a validation failure shows the generic line and names the failed field, in en and vi', async ({ page }) => {
    await page.goto('/register');
    await page.locator('#register-email').fill('new-player@example.com');
    await page.locator('#register-password').fill('        ');
    await page.locator('#register-full-name').fill('New Player');
    await page.getByRole('button', { name: 'Create account' }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Some of the information you entered isn’t valid.');
    await expect(alert).toContainText('Check: Password.');
    await expect(alert.getByRole('link', { name: 'Sign in instead' })).toHaveCount(0);
  });

  test('the same validation failure in vi', async ({ page }) => {
    await useVietnamese(page);
    await page.goto('/register');
    await page.locator('#register-email').fill('new-player@example.com');
    await page.locator('#register-password').fill('        ');
    await page.locator('#register-full-name').fill('Người Chơi');
    await page.getByRole('button', { name: 'Tạo tài khoản' }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Một số thông tin bạn nhập chưa hợp lệ.');
    await expect(alert).toContainText('Kiểm tra: Mật khẩu.');
  });
});

test.describe('login', () => {
  test('invalid credentials in vi stay on the form with the input kept', async ({ page }) => {
    await useVietnamese(page);
    await page.goto('/login');
    await page.locator('#login-email').fill(mockUser.email);
    await page.locator('#login-password').fill('definitely-wrong-password');
    await page.getByRole('button', { name: 'Đăng nhập' }).click();

    await expect(page.getByRole('alert')).toHaveText('Email hoặc mật khẩu không đúng.');
    await expect(page).toHaveURL('/login');
    await expect(page.locator('#login-email')).toHaveValue(mockUser.email);
  });

  test('a 400 validation failure shows the same generic invalid-credentials line, no field detail', async ({ page }) => {
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          message: 'Validation failed',
          errorCode: 'VALIDATION_FAILED',
          errorParams: { fields: { password: 'Password is required' } },
          data: null,
          timestamp: new Date().toISOString(),
        }),
      }),
    );
    await page.goto('/login');
    await page.locator('#login-email').fill(mockUser.email);
    await page.locator('#login-password').fill('   ');
    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page.getByRole('alert')).toHaveText('Invalid email or password.');
    await expect(page).toHaveURL('/login');
  });
});
