import { mockAdminUser, mockPassword, mockUser } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * ADMIN-1: the /admin route's role guard, in a real browser.
 *
 * Why this exists when AdminLayout.test.tsx already covers the same branches:
 * `requiredRole` had never been used by any route before this ticket, so the
 * role branch of ProtectedRoute had never executed in a browser at all. The
 * existing e2e suite covers *authentication* redirects thoroughly
 * (auth-journey.spec.ts step 7 — deep link while logged out) but has no
 * *authorization* coverage anywhere, because every other test logs in as
 * mockUser with roles: ['USER'] and no route cared.
 *
 * What this catches that the RTL test cannot: a router-level mistake — /admin
 * nested in the wrong place, or reachable around the guard through route
 * ordering. The memory-router test renders the same `routes` export, but only a
 * real navigation proves the guard survives a full app mount, including the
 * bootstrap refresh that re-identifies the user on arrival.
 *
 * Both accounts share mockPassword; they differ only in email and roles.
 */

async function logIn(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(mockPassword);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL('/');
}

test('Admin route guard — a user without ADMIN is redirected away from /admin', async ({ page }) => {
  await logIn(page, mockUser.email);

  await page.goto('/admin');

  // Silently redirected to the home feed — deliberate, and confirmed at pickup:
  // /admin is unlinked, so not confirming it exists is better than a 403 page.
  await page.waitForURL('/');
  await expect(page.getByRole('heading', { name: 'Admin' })).toBeHidden();
});

test('Admin route guard — a user holding ADMIN reaches /admin', async ({ page }) => {
  await logIn(page, mockAdminUser.email);

  await page.goto('/admin');

  await expect(page).toHaveURL('/admin');
  await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();
  // ADMIN-2 replaced the index's "no sections yet" empty state with its real link.
  await expect(page.getByRole('heading', { name: 'Sections' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sports' }).first()).toBeVisible();
  // Admin sits outside AppShell — no member-facing chrome.
  await expect(page.getByRole('button', { name: 'Home' })).toBeHidden();
});
