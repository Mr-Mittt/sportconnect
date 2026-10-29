import type { Page, Route } from '@playwright/test';

/**
 * AUTH-14: Keycloak is a redirect away, and MSW (a mock API server) cannot play a browser redirect.
 * These helpers stand in for the hosted pages at the browser level, so the real client code still
 * runs end to end: `/login` builds the PKCE request and navigates, the stub answers, the browser
 * lands on `/auth/callback?code=…&state=…`, and the callback talks to the MSW `/api/auth/callback`
 * handler (e2e/mocks/handlers/auth.ts), which accepts the codes below.
 *
 * Without `signIn`, a request to Keycloak's authorization endpoint gets a static "Keycloak sign-in"
 * page (installed for every test by mocks/test.ts) — which is also where the app lands after a
 * logout. The real redirect against a real Keycloak is AUTH-15's job.
 */
export const KEYCLOAK_AUTH_URL = /\/realms\/sportconnect\/protocol\/openid-connect\/auth\?/;

export type SignInAs = 'user' | 'admin' | 'deactivated';

/** The mock profile every signed-in test user gets (fixtures.ts `mockMyProfile.id`). */
const MOCK_PROFILE_ID = '11111111-1111-4111-8111-111111111111';

/** The one-time codes `POST /api/auth/callback` (the MSW auth handler) understands. */
export const keycloakCode: Record<SignInAs, string> = {
  user: 'user-code',
  admin: 'admin-code',
  deactivated: 'deactivated-code',
};

export async function stubKeycloakSignInPage(page: Page): Promise<void> {
  await page.route(KEYCLOAK_AUTH_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>Keycloak</title><h1>Keycloak sign-in</h1>',
    }),
  );
}

/** Answers the authorization request like a user who signed in: a 302 back to `redirect_uri`. */
export function keycloakRedirectBack(code: string) {
  return (route: Route) => {
    const url = new URL(route.request().url());
    const redirectUri = url.searchParams.get('redirect_uri');
    const state = url.searchParams.get('state');
    return route.fulfill({
      status: 302,
      headers: { location: `${redirectUri}?code=${code}&state=${state}` },
    });
  };
}

/**
 * AUTH-16: the mock profile has no country, so the "complete your profile" dialog opens over the page as
 * soon as the profile loads. A Radix dialog hides everything behind it from the accessibility tree, so a
 * spec's role-based assertions race the profile request. This seeds the session as "skipped" before the
 * app loads. `signIn()` does it for you; a spec that builds its own Keycloak redirect (`page.route` with
 * `keycloakRedirectBack`) and never calls `signIn()` must call it itself, before `page.goto` (AUTH-20).
 */
export async function skipCompleteProfileDialog(page: Page): Promise<void> {
  await page.addInitScript((id) => {
    try {
      sessionStorage.setItem('complete-profile-storage', JSON.stringify({ state: { skippedFor: id }, version: 0 }));
    } catch {
      // sessionStorage unavailable: the spec will see the dialog, which is the safe failure
    }
  }, MOCK_PROFILE_ID);
}

/**
 * Signs in through the real client redirect flow. Visits `path` (default `/login`; pass a protected
 * path to exercise `ProtectedRoute`'s return-to), lets the Keycloak stub send the browser back with
 * the code for `as`, and resolves once the app has settled somewhere other than the sign-in plumbing
 * (`/login`, `/register`, `/auth/callback`). For `deactivated`, or with `stayOnCallback` (an unknown
 * `{ code }` that makes the exchange fail), it resolves on the callback page, where the dialog or the
 * error view is.
 */
export async function signIn(
  page: Page,
  as: SignInAs | { code: string } = 'user',
  options: { path?: string; stayOnCallback?: boolean; completeProfileDialog?: 'show' } = {},
): Promise<void> {
  const code = typeof as === 'string' ? keycloakCode[as] : as.code;
  const redirectBack = keycloakRedirectBack(code);
  let sentToKeycloak!: () => void;
  const arrived = new Promise<void>((resolve) => {
    sentToKeycloak = resolve;
  });
  const handler = (route: Route) => {
    sentToKeycloak();
    return redirectBack(route);
  };
  // It is skipped for the session unless a spec asks to see it.
  if (options.completeProfileDialog !== 'show') await skipCompleteProfileDialog(page);
  await page.route(KEYCLOAK_AUTH_URL, handler);
  try {
    await page.goto(options.path ?? '/login');
    // A protected path is first served as itself and only then redirected by ProtectedRoute, so wait
    // until the app has actually gone to Keycloak before judging where it settled.
    await arrived;
    if (as === 'deactivated' || options.stayOnCallback) {
      await page.waitForURL(/\/auth\/callback/);
    } else {
      await page.waitForURL(
        (url) => !KEYCLOAK_AUTH_URL.test(url.href) && !['/login', '/register', '/auth/callback'].includes(url.pathname),
      );
    }
  } finally {
    await page.unroute(KEYCLOAK_AUTH_URL, handler);
  }
}
