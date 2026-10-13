import { mockExpiredResetToken, mockResetToken, mockUsedResetToken, mockUser } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * AUTH-9: forgot-password and reset-password screens, end to end. The auth handler
 * (e2e/mocks/handlers/auth.ts) mirrors the real backend: forgot-password always answers 200;
 * reset-password answers 200 for `mockResetToken`, 400 RESET_TOKEN_USED / RESET_TOKEN_EXPIRED for
 * the two fixed tokens and 404 RESET_TOKEN_INVALID for anything else. Copy is keyed on the code.
 */

async function useVietnamese(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    localStorage.setItem('locale-storage', JSON.stringify({ state: { locale: 'vi' }, version: 0 }));
  });
}

test('login → forgot password → neutral confirmation, email prefilled from the login form', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(mockUser.email);
  await page.getByRole('link', { name: 'Forgot password?' }).click();

  await expect(page).toHaveURL('/forgot-password');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(mockUser.email);

  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toContainText('If an account exists for that email');
  await expect(page.getByLabel('Email', { exact: true })).toHaveCount(0);

  await page.getByRole('link', { name: 'Back to sign in' }).click();
  await expect(page).toHaveURL('/login');
});

test('an unknown email gets the same confirmation', async ({ page }) => {
  await page.goto('/forgot-password');
  await page.getByLabel('Email', { exact: true }).fill('nobody@example.com');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toContainText('If an account exists for that email');
});

test('reset with a valid link → login screen with the password-updated notice', async ({ page }) => {
  await page.goto(`/reset-password?token=${mockResetToken}`);
  await page.getByLabel('New password', { exact: true }).fill('newpassword1');
  await page.getByLabel('Confirm new password').fill('newpassword1');
  await page.getByRole('button', { name: 'Update password' }).click();

  await expect(page).toHaveURL('/login');
  await expect(page.getByRole('status')).toContainText('Password updated. Sign in with your new password.');
});

test('mismatched passwords stay on the form with an inline message', async ({ page }) => {
  await page.goto(`/reset-password?token=${mockResetToken}`);
  await page.getByLabel('New password', { exact: true }).fill('newpassword1');
  await page.getByLabel('Confirm new password').fill('newpassword2');
  await page.getByRole('button', { name: 'Update password' }).click();

  await expect(page.getByText('The passwords don’t match.')).toBeVisible();
  await expect(page).toHaveURL(/\/reset-password/);
});

test('a missing token shows the invalid-link state with a way to request a new link', async ({ page }) => {
  await page.goto('/reset-password');
  await expect(page.getByRole('alert')).toContainText('This reset link isn’t valid');
  await page.getByRole('link', { name: 'Request a new link' }).click();
  await expect(page).toHaveURL('/forgot-password');
});

// A21: the page asks the server on load, so a dead link never shows the form. The check answers one
// generic RESET_TOKEN_INVALID for an unknown, used or expired token (the mock mirrors that).
for (const token of [mockUsedResetToken, mockExpiredResetToken, 'some-unknown-token']) {
  test(`opening a link with token "${token}" shows the problem state on load, before any submit`, async ({ page }) => {
    await page.goto(`/reset-password?token=${token}`);

    await expect(page.getByRole('alert')).toContainText('has already been used or has expired');
    await expect(page.getByRole('link', { name: 'Request a new link' })).toBeVisible();
    await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
  });
}

test('the page-load check posts the token in the body and shows the form for a live link', async ({ page }) => {
  const checkBodies: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/api/auth/reset-password/validate')) {
      checkBodies.push(`${request.method()} ${request.postData()}`);
    }
  });

  await page.goto(`/reset-password?token=${mockResetToken}`);
  await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
  expect(checkBodies).toEqual([`POST {"token":"${mockResetToken}"}`]);
});

test('a link that goes bad between load and submit still lands on the problem state', async ({ page }) => {
  await page.goto(`/reset-password?token=${mockResetToken}`);
  await page.getByLabel('New password', { exact: true }).fill('newpassword1');
  await page.getByLabel('Confirm new password').fill('newpassword1');
  await page.route('**/api/auth/reset-password', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        message: 'Reset token already used',
        errorCode: 'RESET_TOKEN_USED',
        data: null,
        timestamp: new Date().toISOString(),
      }),
    }),
  );
  await page.getByRole('button', { name: 'Update password' }).click();

  await expect(page.getByRole('alert')).toContainText('This reset link has already been used.');
  await expect(page.getByRole('link', { name: 'Request a new link' })).toBeVisible();
});

test('vi: forgot-password confirmation and dead-link copy on load', async ({ page }) => {
  await useVietnamese(page);
  await page.goto('/forgot-password');
  await expect(page.getByRole('heading', { name: 'Quên mật khẩu?' })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill(mockUser.email);
  await page.getByRole('button', { name: 'Gửi liên kết đặt lại' }).click();
  await expect(page.getByRole('status')).toContainText('Nếu có tài khoản dùng email này');

  await page.goto(`/reset-password?token=${mockExpiredResetToken}`);
  await expect(page.getByRole('alert')).toContainText('đã được sử dụng hoặc đã hết hạn');
  await expect(page.getByRole('link', { name: 'Yêu cầu liên kết mới' })).toBeVisible();
});

test('vi: successful reset shows the login notice in Vietnamese', async ({ page }) => {
  await useVietnamese(page);
  await page.goto(`/reset-password?token=${mockResetToken}`);
  await page.getByLabel('Mật khẩu mới', { exact: true }).fill('newpassword1');
  await page.getByLabel('Nhập lại mật khẩu mới').fill('newpassword1');
  await page.getByRole('button', { name: 'Cập nhật mật khẩu' }).click();
  await expect(page).toHaveURL('/login');
  await expect(page.getByRole('status')).toContainText('Đã cập nhật mật khẩu.');
});
