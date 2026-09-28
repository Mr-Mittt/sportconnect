import { expect, test } from '../mocks/test.ts';

/**
 * CLIENT-REF-2: sign-up's optional Language/Country/Region (GeoLocaleFields, shared with the
 * not-yet-built CLIENT-REF-3), plus the language field switching the UI locale live. Reuses
 * `e2e/mocks/handlers/reference.ts`'s existing fixtures verbatim (CLIENT-REF-1) — a coordinate
 * resolving to Vietnam + Ho Chi Minh City, and the `Asia/Ho_Chi_Minh` timezone-only branch.
 *
 * **Language starts seeded from the active UI locale, never from a resolve** (2026-09-28 fix — see
 * `useGeoLocaleFieldsData.ts`'s own doc comment for the full reasoning): a page already rendering
 * translated must not show this field defaulting to something a silent background resolve
 * separately detects, which can disagree with a *persisted* locale choice. In a fresh Playwright
 * context (no `locale-storage` seeded) that means Language reads `'en'` throughout this file,
 * regardless of what the mocked resolve response's own `language` field says — only an explicit
 * pick in the Language select (or a user-initiated "Use my current location" click) ever changes
 * it or the page's own locale.
 */

test.describe('timezone-based pre-fill (Asia/Ho_Chi_Minh)', () => {
  // Deterministic pre-fill: reference.ts's mock resolve only special-cases this exact IANA zone.
  // Scoped to this describe block only — the geolocation-granted/language-switch tests below
  // must NOT inherit it, since a pre-filled 'vi' would make their own explicit `selectOption('vi')`
  // a no-op (no change event fires when the value doesn't actually change).
  test.use({ timezoneId: 'Asia/Ho_Chi_Minh' });

  test('sign-up pre-fills Language/Country from the mocked resolve response', async ({ page }) => {
    await page.goto('/register');
    // Not `{ exact: true }` — CLIENT-REF-2's RequiredMark ("Email *") makes `getByLabel`'s raw-text
    // exact match miss; non-exact "Email" and anchored `/^Password/` still match only these fields
    // (see a11y.spec.ts's `/register` tab-order test for the full explanation).
    await page.getByLabel('Email').fill('new-player@example.com');
    await page.getByLabel(/^Password/).fill('password123');
    await page.getByLabel('Full name').fill('New Player');

    await expect(page.getByLabel('Country')).toHaveValue('1'); // Vietnam, from reference.ts's mockCountries[0]
    // 'en' — the localeStore seed, not the mocked resolve's 'vi' language: the mount's silent
    // resolve never touches this field (see the file-level doc comment above).
    await expect(page.getByLabel('Language')).toHaveValue('en');
    // Never set by a timezone-only (non-coordinate) resolve — see reference.ts's timezoneOnlyResult.
    await expect(page.getByLabel('Region')).toHaveValue('');
    // A passive pre-fill never flips the UI language on its own.
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();

    await page.getByRole('button', { name: 'Create account' }).click();
    await page.waitForURL('/');
  });

  test('geolocation denied — keeps the timezone pre-fill and still registers', async ({ page }) => {
    // No geolocation permission granted: Chromium resolves getCurrentPosition with
    // PERMISSION_DENIED immediately in a headless context with no way to prompt.
    await page.goto('/register');
    // Not `{ exact: true }` — CLIENT-REF-2's RequiredMark ("Email *") makes `getByLabel`'s raw-text
    // exact match miss; non-exact "Email" and anchored `/^Password/` still match only these fields
    // (see a11y.spec.ts's `/register` tab-order test for the full explanation).
    await page.getByLabel('Email').fill('new-player@example.com');
    await page.getByLabel(/^Password/).fill('password123');
    await page.getByLabel('Full name').fill('New Player');

    await expect(page.getByLabel('Country')).toHaveValue('1'); // pre-filled from the mount's timezone resolve

    await page.getByRole('button', { name: /use my current location/i }).click();
    await expect(page.getByText(/location access was denied/i)).toBeVisible();

    // The denial never clobbers the earlier timezone-based pre-fill (Country) or the Language
    // seed (never touched by the mount resolve to begin with — see the file-level doc comment).
    await expect(page.getByLabel('Country')).toHaveValue('1');
    await expect(page.getByLabel('Language')).toHaveValue('en');

    const registerRequest = page.waitForRequest(
      (request) => request.url().includes('/api/auth/register') && request.method() === 'POST',
    );
    await page.getByRole('button', { name: 'Create account' }).click();

    const request = await registerRequest;
    const body = request.postDataJSON() as { latitude?: number; longitude?: number };
    expect(body.latitude).toBeUndefined();
    expect(body.longitude).toBeUndefined();

    await page.waitForURL('/');
  });
});

test('geolocation granted — fills the region and posts coordinates', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  // Matches reference.ts's COORDINATES_TEST_LATITUDE/LONGITUDE, which resolves to Vietnam + Ho
  // Chi Minh City (id 102 — reference.ts's mockRegionsByCountryId[1][1]; id 101 is Hanoi) with
  // source COORDINATES.
  await context.setGeolocation({ latitude: 10.7769, longitude: 106.7009 });

  const registerRequest = page.waitForRequest(
    (request) => request.url().includes('/api/auth/register') && request.method() === 'POST',
  );

  await page.goto('/register');
  // Not `{ exact: true }` — see a11y.spec.ts's `/register` tab-order test for why.
  await page.getByLabel('Email').fill('new-player@example.com');
  await page.getByLabel(/^Password/).fill('password123');
  await page.getByLabel('Full name').fill('New Player');

  await page.getByRole('button', { name: /use my current location/i }).click();
  await expect(page.getByLabel('Region')).toHaveValue('102'); // Ho Chi Minh City

  await page.getByRole('button', { name: 'Create account' }).click();

  const request = await registerRequest;
  const body = request.postDataJSON() as { latitude?: number; longitude?: number; countryId?: number; regionId?: number };
  expect(body.latitude).toBe(10.7769);
  expect(body.longitude).toBe(106.7009);
  expect(body.countryId).toBe(1);
  expect(body.regionId).toBe(102);

  await page.waitForURL('/');
});

test('choosing a language switches visible copy and the Accept-Language header', async ({ page }) => {
  await page.goto('/register');
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();

  // Fill required fields by their (still-English) labels before switching — Password/Full
  // name/etc. labels translate the instant the language select changes below.
  // Not `{ exact: true }` — see a11y.spec.ts's `/register` tab-order test for why.
  await page.getByLabel('Email').fill('new-player@example.com');
  await page.getByLabel(/^Password/).fill('password123');
  await page.getByLabel('Full name').fill('New Player');

  await page.getByLabel('Language').selectOption('vi');
  await expect(page.getByRole('heading', { name: 'Tạo tài khoản của bạn' })).toBeVisible();

  const registerRequest = page.waitForRequest(
    (request) => request.url().includes('/api/auth/register') && request.method() === 'POST',
  );
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();

  const request = await registerRequest;
  expect(request.headers()['accept-language']).toBe('vi');
  const body = request.postDataJSON() as { languageCode?: string };
  expect(body.languageCode).toBe('vi');

  await page.waitForURL('/');
});
