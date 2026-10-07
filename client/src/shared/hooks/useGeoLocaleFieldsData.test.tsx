import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useLocaleStore } from '@/app/localeStore';
import type { CountryResponse, LanguageResponse, RegionResponse, ResolvedGeoResponse } from '@/shared/types/reference';

vi.mock('@/shared/lib/detectEnvironment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/detectEnvironment')>();
  return {
    ...actual,
    getBrowserLocales: () => ['en-US'],
    requestBrowserPosition: vi.fn(),
  };
});
vi.mock('@/shared/lib/viewerZone', () => ({ getViewerZoneId: () => 'Asia/Ho_Chi_Minh' }));

// Imported after the mocks above so the hook under test picks them up.
import { requestBrowserPosition } from '@/shared/lib/detectEnvironment';
import { useGeoLocaleFieldsData } from './useGeoLocaleFieldsData';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function apiResponse<T>(data: T) {
  return { data: { success: true, message: '', data, timestamp: '' } };
}

const languages: LanguageResponse[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
];
const vietnam: CountryResponse = { id: 1, iso2: 'VN', iso3: 'VNM', name: 'Vietnam', defaultLanguageCode: 'vi' };
const singapore: CountryResponse = { id: 2, iso2: 'SG', iso3: 'SGP', name: 'Singapore', defaultLanguageCode: null };
const franceUnseeded: CountryResponse = {
  id: 3,
  iso2: 'FR',
  iso3: 'FRA',
  name: 'France',
  defaultLanguageCode: 'fr', // not in the active languages list above
};
const countries: CountryResponse[] = [vietnam, singapore, franceUnseeded];
const hcmc: RegionResponse = { id: 101, countryId: 1, isoCode: 'VN-SG', name: 'Ho Chi Minh City', nativeName: 'Hồ Chí Minh' };

const allNull: ResolvedGeoResponse = { language: null, country: null, region: null, source: null };
const timezoneResult: ResolvedGeoResponse = { language: languages[1], country: vietnam, region: null, source: 'TIMEZONE' };
const coordinatesResult: ResolvedGeoResponse = { language: languages[1], country: vietnam, region: hcmc, source: 'COORDINATES' };

function mockReferenceGets(regionsForCountry: RegionResponse[] = []) {
  vi.spyOn(apiClient, 'get').mockImplementation(async (url: unknown) => {
    const path = url as string;
    if (path === '/reference/languages') return apiResponse(languages);
    if (path === '/reference/countries') return apiResponse(countries);
    if (path.startsWith('/reference/countries/')) return apiResponse(regionsForCountry);
    throw new Error(`unexpected GET ${path}`);
  });
}

describe('useGeoLocaleFieldsData', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockReferenceGets();
  });

  it('silently pre-fills country from the mount resolve (locales + timezone only, no coordinates) but never language', async () => {
    // 2026-09-28 fix: the mount's silent resolve deliberately never touches language (it's already
    // seeded from localeStore — see the two tests below) even when it detects a different one.
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce(apiResponse(timezoneResult));

    const { result } = renderHook(() => useGeoLocaleFieldsData(), { wrapper });

    await waitFor(() => expect(result.current.countryId).toBe(1));
    expect(result.current.languageCode).toBe('en'); // the seed (test setup pins locale to 'en'), not 'vi' from timezoneResult
    expect(apiClient.post).toHaveBeenCalledWith('/reference/resolve', {
      locales: ['en-US'],
      timeZoneId: 'Asia/Ho_Chi_Minh',
    });
  });

  it('pre-fills nothing else when the mount resolve is all-null, but languageCode still carries the localeStore seed', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce(apiResponse(allNull));

    const { result } = renderHook(() => useGeoLocaleFieldsData(), { wrapper });

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    expect(result.current.languageCode).toBe('en');
    expect(result.current.countryId).toBeNull();
  });

  it('seeds languageCode from the active UI locale on mount, and the silent resolve never overrides it even when it disagrees (2026-09-28 fix)', async () => {
    useLocaleStore.getState().setLocale('vi');
    // A resolve result that would set 'en' if language weren't seeded+protected — the exact
    // mismatch reported (page already in Vietnamese, this field silently switching to English).
    const englishTimezoneResult: ResolvedGeoResponse = { language: languages[0], country: vietnam, region: null, source: 'TIMEZONE' };
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce(apiResponse(englishTimezoneResult));

    const { result } = renderHook(() => useGeoLocaleFieldsData(), { wrapper });

    expect(result.current.languageCode).toBe('vi'); // seeded synchronously, before the resolve even settles
    await waitFor(() => expect(result.current.countryId).toBe(1)); // country still applies normally
    expect(result.current.languageCode).toBe('vi'); // unchanged — the mount resolve never touches language
  });

  it('never overwrites a field the user already touched, even when the resolve later disagrees', async () => {
    let resolvePost!: (value: unknown) => void;
    vi.spyOn(apiClient, 'post').mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePost = resolve;
      }),
    );

    const { result } = renderHook(() => useGeoLocaleFieldsData(), { wrapper });

    act(() => {
      result.current.onLanguageChange('en');
    });
    expect(result.current.languageCode).toBe('en');

    act(() => {
      resolvePost(apiResponse(timezoneResult)); // would set 'vi' if language weren't touched
    });

    await waitFor(() => expect(result.current.countryId).toBe(1)); // untouched field still applies
    expect(result.current.languageCode).toBe('en'); // touched field never clobbered
  });

  it('onCountryChange clears the region and its touched mark', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce(apiResponse(allNull));
    const { result } = renderHook(() => useGeoLocaleFieldsData(), { wrapper });
    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());

    act(() => {
      result.current.onCountryChange(1);
    });
    act(() => {
      result.current.onRegionChange(101);
    });
    expect(result.current.regionId).toBe(101);

    act(() => {
      result.current.onCountryChange(2);
    });
    expect(result.current.regionId).toBeNull();
  });

  it('applies a hand-picked country\'s default language only when the field is still empty and the code is active', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce(apiResponse(allNull));
    const { result } = renderHook(() => useGeoLocaleFieldsData(), { wrapper });
    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());

    act(() => {
      result.current.onCountryChange(1); // Vietnam, defaultLanguageCode 'vi', active
    });
    expect(result.current.languageCode).toBe('vi');

    // A later country pick with no default (or an inactive one) never overwrites the
    // now-non-empty language field.
    act(() => {
      result.current.onCountryChange(2); // Singapore, no default language
    });
    expect(result.current.languageCode).toBe('vi');
  });

  it('does not apply a default language that names an inactive/unseeded language', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce(apiResponse(allNull));
    const { result } = renderHook(() => useGeoLocaleFieldsData(), { wrapper });
    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());

    act(() => {
      result.current.onCountryChange(3); // France, defaultLanguageCode 'fr' — not in `languages`
    });
    expect(result.current.languageCode).toBe('en'); // untouched — stays at the localeStore seed, never 'fr'
  });

  it('onUseMyLocation: denied sets geoHint and never calls resolve again', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce(apiResponse(allNull));
    vi.mocked(requestBrowserPosition).mockResolvedValueOnce({ status: 'denied' });
    const { result } = renderHook(() => useGeoLocaleFieldsData(), { wrapper });
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.onUseMyLocation();
    });

    await waitFor(() => expect(result.current.geoHint).toBe('denied'));
    expect(apiClient.post).toHaveBeenCalledTimes(1); // no second resolve call
    expect(result.current.latitude).toBeNull();
  });

  it.each(['unavailable', 'timeout'] as const)('onUseMyLocation: %s sets geoHint, never calls resolve', async (status) => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce(apiResponse(allNull));
    vi.mocked(requestBrowserPosition).mockResolvedValueOnce({ status });
    const { result } = renderHook(() => useGeoLocaleFieldsData(), { wrapper });
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.onUseMyLocation();
    });

    await waitFor(() => expect(result.current.geoHint).toBe(status));
    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });

  it('onUseMyLocation: granted resolves with coordinates, overwrites untouched fields, keeps the coordinates', async () => {
    vi.spyOn(apiClient, 'post')
      .mockResolvedValueOnce(apiResponse(allNull)) // mount resolve
      .mockResolvedValueOnce(apiResponse(coordinatesResult)); // button resolve
    vi.mocked(requestBrowserPosition).mockResolvedValueOnce({
      status: 'granted',
      latitude: 10.7769,
      longitude: 106.7009,
    });

    const { result } = renderHook(() => useGeoLocaleFieldsData(), { wrapper });
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.onUseMyLocation();
    });

    await waitFor(() => expect(result.current.countryId).toBe(1));
    expect(result.current.languageCode).toBe('vi');
    expect(result.current.regionId).toBe(101);
    expect(result.current.latitude).toBe(10.7769);
    expect(result.current.longitude).toBe(106.7009);
    expect(result.current.geoHint).toBeNull();
    expect(apiClient.post).toHaveBeenLastCalledWith('/reference/resolve', {
      locales: ['en-US'],
      timeZoneId: 'Asia/Ho_Chi_Minh',
      latitude: 10.7769,
      longitude: 106.7009,
    });
  });

  it('onUseMyLocation: granted never overwrites a field the user already touched', async () => {
    vi.spyOn(apiClient, 'post')
      .mockResolvedValueOnce(apiResponse(allNull))
      .mockResolvedValueOnce(apiResponse(coordinatesResult));
    vi.mocked(requestBrowserPosition).mockResolvedValueOnce({
      status: 'granted',
      latitude: 10.7769,
      longitude: 106.7009,
    });

    const { result } = renderHook(() => useGeoLocaleFieldsData(), { wrapper });
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.onLanguageChange('en');
    });

    act(() => {
      result.current.onUseMyLocation();
    });

    await waitFor(() => expect(result.current.countryId).toBe(1)); // untouched, still applied
    expect(result.current.languageCode).toBe('en'); // touched, never overwritten
  });

  it('a failed resolve call pre-fills nothing (beyond the languageCode seed) and never throws', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(new Error('network error'));

    const { result } = renderHook(() => useGeoLocaleFieldsData(), { wrapper });

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    expect(result.current.languageCode).toBe('en'); // the seed — a failed resolve never touched it anyway
    expect(result.current.countryId).toBeNull();
  });

  describe('server-rejected selections (CLIENT-ERR-8)', () => {
    beforeEach(() => {
      vi.spyOn(apiClient, 'post').mockResolvedValue(apiResponse(allNull));
    });

    it('REGION_UNKNOWN clears the region, keeps the country and sets serverGeoCode until the next pick', async () => {
      const { result } = renderHook(() => useGeoLocaleFieldsData({ countryId: 1, regionId: 101 }), { wrapper });
      await waitFor(() => expect(result.current.isReferenceLoading).toBe(false));

      act(() => result.current.applyServerErrorCode('REGION_UNKNOWN'));

      expect(result.current.regionId).toBeNull();
      expect(result.current.countryId).toBe(1);
      expect(result.current.serverGeoCode).toBe('REGION_UNKNOWN');

      act(() => result.current.onRegionChange(101));
      expect(result.current.serverGeoCode).toBeNull();
    });

    it('COUNTRY_UNKNOWN clears the country and the region', async () => {
      const { result } = renderHook(() => useGeoLocaleFieldsData({ countryId: 1, regionId: 101 }), { wrapper });
      await waitFor(() => expect(result.current.isReferenceLoading).toBe(false));

      act(() => result.current.applyServerErrorCode('COUNTRY_UNKNOWN'));

      expect(result.current.countryId).toBeNull();
      expect(result.current.regionId).toBeNull();
      expect(result.current.serverGeoCode).toBe('COUNTRY_UNKNOWN');
    });

    it('REGION_COUNTRY_REQUIRED shows the hint and leaves the country alone', async () => {
      const { result } = renderHook(() => useGeoLocaleFieldsData({ countryId: 1 }), { wrapper });
      await waitFor(() => expect(result.current.isReferenceLoading).toBe(false));

      act(() => result.current.applyServerErrorCode('REGION_COUNTRY_REQUIRED'));

      expect(result.current.countryId).toBe(1);
      expect(result.current.serverGeoCode).toBe('REGION_COUNTRY_REQUIRED');
    });

    it('ignores null and codes that are not geo codes', async () => {
      const { result } = renderHook(() => useGeoLocaleFieldsData({ countryId: 1, regionId: 101 }), { wrapper });
      await waitFor(() => expect(result.current.isReferenceLoading).toBe(false));

      act(() => result.current.applyServerErrorCode(null));
      act(() => result.current.applyServerErrorCode('EMAIL_ALREADY_REGISTERED'));

      expect(result.current.regionId).toBe(101);
      expect(result.current.serverGeoCode).toBeNull();
    });

    it('a COUNTRY_NOT_FOUND from the regions list is handled like a rejected country', async () => {
      vi.spyOn(apiClient, 'get').mockImplementation(async (url: unknown) => {
        const path = url as string;
        if (path === '/reference/languages') return apiResponse(languages);
        if (path === '/reference/countries') return apiResponse(countries);
        throw {
          isAxiosError: true,
          response: {
            status: 404,
            data: { success: false, message: 'Country not found', errorCode: 'COUNTRY_NOT_FOUND', data: null, timestamp: '' },
          },
        };
      });

      const { result } = renderHook(() => useGeoLocaleFieldsData({ countryId: 1 }), { wrapper });

      await waitFor(() => expect(result.current.serverGeoCode).toBe('COUNTRY_NOT_FOUND'));
      expect(result.current.countryId).toBeNull();
    });
  });
});
