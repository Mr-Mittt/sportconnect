/**
 * CLIENT-REF-1: 1:1 with the reference-data DTOs (`modules/reference/reference-api`) — the
 * Language / Country / Region lookups `GeoLocaleFields` and its data hooks use, plus the
 * coordinate/timezone/locale resolver's request/response shapes.
 */

/** A language the app supports. `code` is the BCP 47 tag (`en`, `vi`) — the same value
 * `UserPreference.language` stores and `localeStore`'s `LocaleCode` is drawn from. */
export interface LanguageResponse {
  code: string;
  /** English name, e.g. `Vietnamese`. */
  name: string;
  /** The language's own name, e.g. `Tiếng Việt`. */
  nativeName: string;
}

/** A country. `name` is the English name — localized display is done client-side with
 * `Intl.DisplayNames`, keyed by `iso2`, never by translating this field. */
export interface CountryResponse {
  /** Generated id — what other domains (and `regionId`) reference. Never assume a particular
   * country's id; look it up by `iso2`. */
  id: number;
  /** ISO 3166-1 alpha-2, e.g. `VN`. */
  iso2: string;
  /** ISO 3166-1 alpha-3, e.g. `VNM`. */
  iso3: string;
  name: string;
  /** BCP 47 code of this country's default language, or `null` when it has none. Returned as
   * stored — it may name a language that isn't currently active, so a caller pre-filling a
   * language field from this must check it against the active `useLanguages()` list first. */
  defaultLanguageCode: string | null;
}

/** A region — the state/province level below a country (the "zone" of Language / Country /
 * Zone; not a timezone). */
export interface RegionResponse {
  id: number;
  /** The owning country's id. */
  countryId: number;
  /** ISO 3166-2 code, e.g. `VN-SG`. */
  isoCode: string;
  /** English/romanized name. */
  name: string;
  /** Name in the country's own language, e.g. `Hồ Chí Minh`. */
  nativeName: string;
}

/** Which signal produced a `ResolvedGeoResponse.country`, in priority order: coordinates, then
 * timezone, then the region subtag of a browser locale. `null` exactly when `country` is. */
export type GeoSource = 'COORDINATES' | 'TIMEZONE' | 'LOCALE';

/**
 * What a browser can tell us about where the user is, sent to `POST /api/reference/resolve`.
 * Every field is optional; send `latitude`/`longitude` together or not at all (a `400` otherwise).
 */
export interface ResolveGeoRequest {
  /** `navigator.languages`, most preferred first, e.g. `['vi-VN', 'en-US']`. At most 10 entries
   * of at most 35 characters each. */
  locales?: string[];
  /** IANA zone id from `Intl.DateTimeFormat().resolvedOptions().timeZone`. At most 64 characters. */
  timeZoneId?: string;
  /** WGS 84 latitude in degrees, range ±90. */
  latitude?: number;
  /** WGS 84 longitude in degrees, range ±180. */
  longitude?: number;
}

/** The reference rows a `ResolveGeoRequest` matched. Every part is nullable and an unresolved
 * request is a normal `200` all-null result, never an error. */
export interface ResolvedGeoResponse {
  /** Active language matched from the locales, else the resolved country's default language
   * when that is active. */
  language: LanguageResponse | null;
  /** Active country matched by coordinates, then timezone, then locale region. */
  country: CountryResponse | null;
  /** Active region of `country`; only ever set when `source` is `'COORDINATES'`. */
  region: RegionResponse | null;
  /** Which signal produced `country`; `null` exactly when `country` is `null`. */
  source: GeoSource | null;
}
