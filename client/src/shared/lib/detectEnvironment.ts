/**
 * CLIENT-REF-1: read-only signals about the caller's browser environment, fed to
 * `POST /api/reference/resolve` by `useGeoLocaleFieldsData`. Nothing here prompts the user —
 * `getBrowserLocales` and `getViewerZoneId` (`./viewerZone`) are always-available, no-permission
 * browser APIs; `requestBrowserPosition` triggers the browser's geolocation permission prompt and
 * must only ever be called from a user-initiated handler (a button's `onClick`), never on mount or
 * any other automatic trigger.
 */

/**
 * `navigator.languages`, most-preferred first — the same shape `ResolveGeoRequest.locales` wants.
 * Falls back to the single `navigator.language` (some environments only support that), then `[]`
 * (never sent, since an empty array narrows nothing for the resolver either way).
 */
export function getBrowserLocales(): string[] {
  if (navigator.languages && navigator.languages.length > 0) {
    return [...navigator.languages];
  }
  if (navigator.language) {
    return [navigator.language];
  }
  return [];
}

/** Whether `requestBrowserPosition` can do anything at all — an insecure context (`http://`,
 * most browsers) or an old/embedded WebView has no `navigator.geolocation`. `GeoLocaleFields`
 * hides its "Use my current location" button entirely when this is `false`, per this ticket's
 * edge case (a disabled-but-visible button inviting a click that can only ever fail is worse). */
export function isGeolocationSupported(): boolean {
  return 'geolocation' in navigator;
}

export type BrowserPositionResult =
  | { status: 'granted'; latitude: number; longitude: number }
  | { status: 'denied' }
  | { status: 'unavailable' }
  | { status: 'timeout' };

/** How long the browser is given to produce a position before this gives up and resolves
 * `{ status: 'timeout' }` on its own — `getCurrentPosition`'s own `timeout` option covers a slow
 * GPS fix, but some browsers never reject at all when permission is silently never granted. */
const POSITION_TIMEOUT_MS = 10_000;

/**
 * Wraps `navigator.geolocation.getCurrentPosition` in a promise with a typed, exhaustive result
 * instead of a callback pair — the caller (`useGeoLocaleFieldsData`) never has to branch on a raw
 * `GeolocationPositionError.code`. Never rejects: every outcome, including "not supported at all",
 * comes back as a normal result so a caller can render a non-blocking hint instead of a caught
 * exception. **Only ever call this from a click handler** — this is what turns on the browser's
 * native permission prompt, and prompting on mount without a user action would be surprising and
 * is explicitly out of scope.
 */
export function requestBrowserPosition(): Promise<BrowserPositionResult> {
  if (!isGeolocationSupported()) {
    return Promise.resolve({ status: 'unavailable' });
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          status: 'granted',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          resolve({ status: 'denied' });
        } else if (error.code === error.TIMEOUT) {
          resolve({ status: 'timeout' });
        } else {
          resolve({ status: 'unavailable' });
        }
      },
      { timeout: POSITION_TIMEOUT_MS },
    );
  });
}
