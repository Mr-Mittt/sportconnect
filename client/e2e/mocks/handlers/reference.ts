import { http, HttpResponse, type HttpHandler } from 'msw';
import type { ApiResponse } from '../../../src/shared/types/api.ts';
import type {
  CountryResponse,
  LanguageResponse,
  RegionResponse,
  ResolveGeoRequest,
  ResolvedGeoResponse,
} from '../../../src/shared/types/reference.ts';

function apiResponse<T>(data: T, message = 'Success'): ApiResponse<T> {
  return { success: true, message, data, timestamp: new Date().toISOString() };
}

// CLIENT-REF-1: mirrors the real REF-1 seed (`en`/`vi`; Vietnam only — REF-4 seeds the rest).
export const mockLanguages: LanguageResponse[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
];

export const mockCountries: CountryResponse[] = [
  { id: 1, iso2: 'VN', iso3: 'VNM', name: 'Vietnam', defaultLanguageCode: 'vi' },
  // Has no seeded regions — exercises GeoLocaleFields' "no regions for this country" state.
  { id: 2, iso2: 'SG', iso3: 'SGP', name: 'Singapore', defaultLanguageCode: null },
];

export const mockRegionsByCountryId: Record<number, RegionResponse[]> = {
  1: [
    { id: 101, countryId: 1, isoCode: 'VN-HN', name: 'Hanoi', nativeName: 'Hà Nội' },
    { id: 102, countryId: 1, isoCode: 'VN-SG', name: 'Ho Chi Minh City', nativeName: 'Hồ Chí Minh' },
  ],
  2: [],
};

// A fixed test coordinate resolves to Vietnam + Ho Chi Minh City (source: COORDINATES) — any
// other coordinate falls through to the timezone-only response, same fallthrough order the real
// resolver uses (coordinates > timezone > locale).
const COORDINATES_TEST_LATITUDE = 10.7769;
const COORDINATES_TEST_LONGITUDE = 106.7009;

const coordinatesResult: ResolvedGeoResponse = {
  language: mockLanguages[1],
  country: mockCountries[0],
  region: mockRegionsByCountryId[1][1],
  source: 'COORDINATES',
};

// Only Vietnam is seeded today (REF-4 not shipped) — a non-Vietnam timezone/locale resolves to an
// all-null 200, the common case per the backend REF-2 Delta note, not an edge case.
const timezoneOnlyResult: ResolvedGeoResponse = {
  language: mockLanguages[1],
  country: mockCountries[0],
  region: null,
  source: 'TIMEZONE',
};

const allNullResult: ResolvedGeoResponse = {
  language: null,
  country: null,
  region: null,
  source: null,
};

export const referenceHandlers: HttpHandler[] = [
  http.get('/api/reference/languages', () => {
    return HttpResponse.json(apiResponse(mockLanguages));
  }),

  http.get('/api/reference/countries', () => {
    return HttpResponse.json(apiResponse(mockCountries));
  }),

  http.get('/api/reference/countries/:countryId/regions', ({ params }) => {
    const countryId = Number(params.countryId);
    const regions = mockRegionsByCountryId[countryId];
    if (regions === undefined) {
      return HttpResponse.json(
        { success: false, message: 'Country not found', data: null, errorCode: 'COUNTRY_NOT_FOUND', timestamp: new Date().toISOString() },
        { status: 404 },
      );
    }
    return HttpResponse.json(apiResponse(regions));
  }),

  http.post('/api/reference/resolve', async ({ request }) => {
    const body = (await request.json()) as ResolveGeoRequest;

    if (body.latitude === COORDINATES_TEST_LATITUDE && body.longitude === COORDINATES_TEST_LONGITUDE) {
      return HttpResponse.json(apiResponse(coordinatesResult, 'Geo resolved successfully'));
    }
    // CLIENT-REF-2 finding: a Playwright context's `timezoneId: 'Asia/Ho_Chi_Minh'` option is
    // itself an alias — Chromium's Intl canonicalizes it and the browser actually reports
    // `Asia/Saigon` via `getViewerZoneId()`. The real backend already treats both IANA names as
    // equivalent (see this file's own module doc: "Asia/Saigon and Asia/Ho_Chi_Minh both resolve
    // to VN"); this mock only checked one of the two, which silently broke any e2e test asking
    // for the Ho Chi Minh timezone (it always got the all-null fallback instead).
    if (body.timeZoneId === 'Asia/Ho_Chi_Minh' || body.timeZoneId === 'Asia/Saigon') {
      return HttpResponse.json(apiResponse(timezoneOnlyResult, 'Geo resolved successfully'));
    }
    return HttpResponse.json(apiResponse(allNullResult, 'Geo resolved successfully'));
  }),
];
