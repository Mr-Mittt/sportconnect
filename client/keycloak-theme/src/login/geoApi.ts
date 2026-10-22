import type {
  CountryResponse,
  RegionResponse,
  ResolvedGeoResponse,
  ResolveGeoRequest,
} from '@/shared/types/reference';

/**
 * AUTH-16: the three public reference calls the register page's zone block needs
 * (`GET /api/reference/countries`, `GET /api/reference/countries/{id}/regions`,
 * `POST /api/reference/resolve`). The page is served by Keycloak, a different origin from the app,
 * so these are cross-origin requests to the API (its CORS list must allow the Keycloak origin) and
 * the base URL comes from the theme property `SPORTCONNECT_API_BASE_URL`, set per environment.
 * Plain `fetch` on purpose: the theme has no TanStack Query or app `apiClient`, and every field it
 * fills is optional, so a failure here is shown as a hint and never blocks registration.
 */
interface ApiEnvelope<T> {
  data: T;
}

async function request<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
  });
  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${path} -> ${response.status}`);
  }
  return ((await response.json()) as ApiEnvelope<T>).data;
}

export function getCountries(baseUrl: string): Promise<CountryResponse[]> {
  return request(baseUrl, '/reference/countries');
}

export function getRegions(baseUrl: string, countryId: number): Promise<RegionResponse[]> {
  return request(baseUrl, `/reference/countries/${countryId}/regions`);
}

export function resolveGeo(baseUrl: string, body: ResolveGeoRequest): Promise<ResolvedGeoResponse> {
  return request(baseUrl, '/reference/resolve', { method: 'POST', body: JSON.stringify(body) });
}
