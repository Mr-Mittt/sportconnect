import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBrowserLocales, isGeolocationSupported, requestBrowserPosition } from './detectEnvironment';

function setNavigatorLanguages(languages: string[] | undefined, language?: string): void {
  Object.defineProperty(navigator, 'languages', { value: languages, configurable: true });
  if (language !== undefined) {
    Object.defineProperty(navigator, 'language', { value: language, configurable: true });
  }
}

function setNavigatorGeolocation(geolocation: Geolocation | undefined): void {
  if (geolocation === undefined) {
    // `'geolocation' in navigator` checks for the property key, not its value — defining it as
    // `undefined` would still make the key exist. Delete it instead to simulate a real
    // insecure-context/unsupported browser, where the key is genuinely absent.
    delete (navigator as { geolocation?: Geolocation }).geolocation;
    return;
  }
  Object.defineProperty(navigator, 'geolocation', { value: geolocation, configurable: true });
}

describe('getBrowserLocales', () => {
  afterEach(() => {
    setNavigatorLanguages(navigator.languages ? [...navigator.languages] : ['en-US']);
  });

  it('returns navigator.languages, most-preferred first', () => {
    setNavigatorLanguages(['vi-VN', 'en-US']);
    expect(getBrowserLocales()).toEqual(['vi-VN', 'en-US']);
  });

  it('falls back to navigator.language when languages is empty', () => {
    setNavigatorLanguages([], 'fr-FR');
    expect(getBrowserLocales()).toEqual(['fr-FR']);
  });

  it('falls back to navigator.language when languages is undefined', () => {
    setNavigatorLanguages(undefined, 'fr-FR');
    expect(getBrowserLocales()).toEqual(['fr-FR']);
  });

  it('returns [] when nothing is available', () => {
    setNavigatorLanguages([], '');
    expect(getBrowserLocales()).toEqual([]);
  });
});

describe('isGeolocationSupported', () => {
  afterEach(() => {
    setNavigatorGeolocation(undefined);
  });

  it('is false when navigator.geolocation is absent (insecure context, old WebView)', () => {
    setNavigatorGeolocation(undefined);
    expect(isGeolocationSupported()).toBe(false);
  });

  it('is true when navigator.geolocation exists', () => {
    setNavigatorGeolocation({} as Geolocation);
    expect(isGeolocationSupported()).toBe(true);
  });
});

describe('requestBrowserPosition', () => {
  afterEach(() => {
    setNavigatorGeolocation(undefined);
    vi.restoreAllMocks();
  });

  it('resolves unavailable when geolocation is not supported', async () => {
    setNavigatorGeolocation(undefined);
    await expect(requestBrowserPosition()).resolves.toEqual({ status: 'unavailable' });
  });

  it('resolves granted with the coordinates on success', async () => {
    setNavigatorGeolocation({
      getCurrentPosition: (success: PositionCallback) => {
        success({
          coords: { latitude: 10.7769, longitude: 106.7009 },
        } as GeolocationPosition);
      },
    } as unknown as Geolocation);

    await expect(requestBrowserPosition()).resolves.toEqual({
      status: 'granted',
      latitude: 10.7769,
      longitude: 106.7009,
    });
  });

  it('resolves denied on PERMISSION_DENIED', async () => {
    setNavigatorGeolocation({
      getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) => {
        error({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
      },
    } as unknown as Geolocation);

    await expect(requestBrowserPosition()).resolves.toEqual({ status: 'denied' });
  });

  it('resolves timeout on TIMEOUT', async () => {
    setNavigatorGeolocation({
      getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) => {
        error({ code: 3, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
      },
    } as unknown as Geolocation);

    await expect(requestBrowserPosition()).resolves.toEqual({ status: 'timeout' });
  });

  it('resolves unavailable on POSITION_UNAVAILABLE', async () => {
    setNavigatorGeolocation({
      getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) => {
        error({ code: 2, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
      },
    } as unknown as Geolocation);

    await expect(requestBrowserPosition()).resolves.toEqual({ status: 'unavailable' });
  });
});
