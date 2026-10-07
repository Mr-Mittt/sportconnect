import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocaleStore } from '@/app/localeStore';
import { getApiError } from '@/shared/lib/apiError';
import { getBrowserLocales, isGeolocationSupported, requestBrowserPosition } from '@/shared/lib/detectEnvironment';
import { isGeoServerCode } from '@/shared/lib/geoErrors';
import { getViewerZoneId } from '@/shared/lib/viewerZone';
import type { CountryResponse, LanguageResponse, RegionResponse } from '@/shared/types/reference';
import { countriesQueryKey, useCountries } from './useCountries';
import { useLanguages } from './useLanguages';
import { regionsQueryKey, useRegions } from './useRegions';
import { useResolveGeo } from './useResolveGeo';

type TouchedField = 'language' | 'country' | 'region';

/** Non-blocking outcome of the "Use my current location" button — `null` means nothing to show
 * (either never clicked, or it succeeded). A resolve-call failure is deliberately not one of
 * these: see `useResolveGeo`'s doc comment for why it's swallowed instead of surfaced. */
export type GeoHint = 'denied' | 'unavailable' | 'timeout';

export interface GeoLocaleFieldsData {
  languages: LanguageResponse[];
  countries: CountryResponse[];
  regions: RegionResponse[];
  /** `languages`/`countries` failed to load — the ticket's blocking case: all three selects
   * render disabled with an error hint, since there's nothing to populate any of them with. */
  isReferenceError: boolean;
  isReferenceLoading: boolean;
  /** Only the selected country's regions failed to load — narrower than `isReferenceError`:
   * language and country stay usable, just the region select shows its own disabled+hint state. */
  isRegionsError: boolean;

  languageCode: string | null;
  countryId: number | null;
  regionId: number | null;
  onLanguageChange: (code: string | null) => void;
  onCountryChange: (id: number | null) => void;
  onRegionChange: (id: number | null) => void;

  isGeolocationSupported: boolean;
  isRequestingLocation: boolean;
  geoHint: GeoHint | null;
  /** CLIENT-ERR-8: the reference code the server rejected the selection with (`REGION_UNKNOWN` and
   * friends), shown in the same hint line as `geoHint`; `null` when there is none. Cleared on any pick. */
  serverGeoCode: string | null;
  /** CLIENT-ERR-8: call with the `errorCode` of a failed register / profile save. A geo code clears
   * the stale selection, refetches the matching list and sets `serverGeoCode`; anything else is ignored. */
  applyServerErrorCode: (code: string | null) => void;
  onUseMyLocation: () => void;

  /** Coordinates from a successful "Use my current location" click — `null` until one succeeds.
   * Kept here, not just applied internally, so the page embedding this (CLIENT-REF-2/3) can send
   * them along with the rest of its own submission; this hook never persists anything itself. */
  latitude: number | null;
  longitude: number | null;
}

/** Seeds Language/Country/Region from an already-known value (CLIENT-REF-3: the profile's stored
 * `countryId`/`regionId`, the caller's stored language preference) instead of starting empty like
 * anonymous sign-up. Every field is optional and independently seeded. A **non-null** seed is
 * pre-marked `touched` (same "an edit always wins over detection" rule this hook already applies
 * to a hand-pick) — a stored value is a real prior choice, so the mount's silent resolve must
 * never silently overwrite it; a later explicit "Use my location" click still captures new
 * coordinates but likewise won't clobber an already-touched field. A `null`/omitted seed behaves
 * exactly as the no-`initial` case (untouched, open to resolve/default-language fill). */
export interface GeoLocaleFieldsInitial {
  languageCode?: string | null;
  countryId?: number | null;
  regionId?: number | null;
}

/**
 * CLIENT-REF-1: the page-level data hook behind `GeoLocaleFields` — composes the four reference
 * hooks, runs the one-time silent (locales + timezone) resolve on mount, and owns the "Use my
 * current location" button's flow. Shared verbatim by sign-up (CLIENT-REF-2, anonymous) and
 * profile edit (CLIENT-REF-3, authenticated) via the optional `initial` seed (see
 * {@link GeoLocaleFieldsInitial}) — every reference read and the resolve endpoint itself stay
 * public and caller-agnostic either way.
 *
 * **Touched-field protection.** A field the user has explicitly changed (`onLanguageChange` /
 * `onCountryChange` / `onRegionChange`) is recorded in an internal `touched` set and is never
 * overwritten by a resolve result again — an edit always wins over detection, no matter which
 * fires first or second. `onCountryChange` is the one exception that *removes* a touch mark: it
 * clears `regionId` and un-touches `region`, since a region picked for the old country doesn't
 * mean anything for the new one, and a later coordinate resolve for the new country should still
 * be able to fill it in.
 *
 * **Default language.** The backend already applies `CountryResponse.defaultLanguageCode` inside
 * `resolve` itself (silent or coordinate-triggered), so this hook only has to apply it for the one
 * case the server can't see: the user picking a country by hand with no resolve call involved. It
 * only fires when `language` is still untouched (an already-set value, however it got set, is left
 * alone) and only when that code names a currently active language.
 *
 * **Initial language (2026-09-28 fix).** `languageCode` starts seeded from `localeStore`'s active
 * UI locale, not `null` — see its own field comment for why (a page already rendering translated
 * must not show this field defaulting to something else). It is deliberately left *untouched* at
 * seed time so the country-hand-pick default above still fires normally; instead, the mount's own
 * silent resolve is the one told to skip language entirely, since that resolve's detection would
 * otherwise silently race the seed. See `applyResolvedFields`'s doc comment for the full reasoning.
 */
export function useGeoLocaleFieldsData(initial?: GeoLocaleFieldsInitial): GeoLocaleFieldsData {
  const { data: languages, isLoading: isLanguagesLoading, isError: isLanguagesError } = useLanguages();
  const { data: countries, isLoading: isCountriesLoading, isError: isCountriesError } = useCountries();

  // Seeded from the active UI locale (2026-09-28 fix), not `null` — a page already rendering in
  // Vietnamese (e.g. `localeStore`'s persisted choice from an earlier visit) must not show this
  // field defaulting to whatever the browser's raw signals separately resolve to (often English,
  // since it's re-detected fresh from `navigator.languages` on every mount independent of any
  // persisted override) — that mismatch (page in Vietnamese, this field showing "English") is
  // confusing and was reported against sign-up. Left un-touched (not added to `touchedRef` below):
  // the mount's silent resolve is instead told to skip language entirely (see its own call below),
  // which fixes the mismatch without disabling the country-hand-pick default-language feature,
  // whose own gating still reads `touchedRef`, not "is languageCode null" (that check would always
  // be false now that this is never `null` to begin with).
  //
  // CLIENT-REF-3: `initial?.languageCode` overrides the localeStore seed when given (a non-null
  // stored preference wins over the page's current UI locale, same as it wins over resolve below).
  const [languageCode, setLanguageCode] = useState<string | null>(
    () => initial?.languageCode ?? useLocaleStore.getState().locale,
  );
  const [countryId, setCountryId] = useState<number | null>(() => initial?.countryId ?? null);
  const [regionId, setRegionId] = useState<number | null>(() => initial?.regionId ?? null);
  // CLIENT-REF-3: every non-null `initial` seed starts pre-touched — see GeoLocaleFieldsInitial's
  // own doc comment for why (a stored value is a real prior choice, never silently overwritten).
  const touchedRef = useRef<Set<TouchedField>>(
    new Set(
      (['language', 'country', 'region'] as const).filter((field) => {
        if (field === 'language') return (initial?.languageCode ?? null) !== null;
        if (field === 'country') return (initial?.countryId ?? null) !== null;
        return (initial?.regionId ?? null) !== null;
      }),
    ),
  );

  const {
    data: regions,
    isLoading: isRegionsLoading,
    isError: isRegionsError,
    error: regionsError,
  } = useRegions(countryId);
  const queryClient = useQueryClient();
  const [serverGeoCode, setServerGeoCode] = useState<string | null>(null);

  const { resolve } = useResolveGeo();
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);
  const [geoHint, setGeoHint] = useState<GeoHint | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  /** Applies a resolve result, honoring `touchedRef` — shared by the silent mount resolve and the
   * coordinate-triggered one from the location button; the only difference between the two is
   * which signals go into the request, not how the response gets applied.
   *
   * `applyLanguage` (2026-09-28 fix) — the mount call below passes `false`: `languageCode` is
   * already seeded from `localeStore`'s active UI locale (see its own comment above), and the
   * mount resolve's own language detection reads the same raw browser signal `localeStore` itself
   * used, so it can only ever agree with the seed or, if `localeStore` is instead following a
   * *persisted* explicit choice from an earlier visit, silently contradict a value the page is
   * already visibly rendered in — exactly the mismatch reported (page in Vietnamese, this field
   * showing "English"). The button-triggered call omits this option (defaults `true`): a click is
   * a deliberate, current action, and its result can carry a country/coordinate-derived default
   * language meaningfully more specific than the coarse initial seed, still gated by `touched` so
   * an explicit pick is never overwritten either way. */
  const applyResolvedFields = useCallback(
    (
      result: { language: LanguageResponse | null; country: CountryResponse | null; region: RegionResponse | null },
      options?: { applyLanguage?: boolean },
    ) => {
      const touched = touchedRef.current;
      const applyLanguage = options?.applyLanguage ?? true;
      if (applyLanguage && result.language && !touched.has('language')) {
        setLanguageCode(result.language.code);
      }
      if (result.country && !touched.has('country')) {
        setCountryId(result.country.id);
      }
      if (result.region && !touched.has('region')) {
        setRegionId(result.region.id);
      }
    },
    [],
  );

  // One silent resolve on mount — locales + timezone only, never coordinates (that only ever
  // happens from a user-initiated button click). Runs once regardless of StrictMode's dev
  // double-invoke: `resolve` (mutateAsync) has no side effect worth guarding beyond the one
  // extra network call, which mirrors how every other mount-effect fetch in this codebase is
  // written (e.g. `useSessionBootstrap`). `applyLanguage: false` — see `applyResolvedFields`'s own
  // doc comment.
  useEffect(() => {
    void resolve({ locales: getBrowserLocales(), timeZoneId: getViewerZoneId() }).then(
      (result) => applyResolvedFields(result, { applyLanguage: false }),
      () => {
        // A resolve failure pre-fills nothing — see useResolveGeo's doc comment.
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally mount-only
  }, []);

  const onLanguageChange = useCallback((code: string | null) => {
    touchedRef.current.add('language');
    setLanguageCode(code);
  }, []);

  const onCountryChange = useCallback(
    (id: number | null) => {
      touchedRef.current.add('country');
      touchedRef.current.delete('region');
      setServerGeoCode(null);
      setCountryId(id);
      setRegionId(null);

      // `touchedRef.has('language')`, not "is languageCode null" — `languageCode` is now always
      // seeded from `localeStore` (see its own comment above) and so is never `null` to begin
      // with; "untouched" is what actually means "the user hasn't made a real language decision
      // yet" here.
      if (id === null || touchedRef.current.has('language')) {
        return;
      }
      const country = countries.find((candidate) => candidate.id === id);
      const defaultCode = country?.defaultLanguageCode;
      if (!defaultCode) {
        return;
      }
      const isActive = languages.some((language) => language.code === defaultCode);
      if (isActive) {
        setLanguageCode(defaultCode);
      }
    },
    [countries, languages],
  );

  const onRegionChange = useCallback((id: number | null) => {
    touchedRef.current.add('region');
    setServerGeoCode(null);
    setRegionId(id);
  }, []);

  // Read through a ref so `applyServerErrorCode` stays stable: callers run it from an effect keyed on
  // the server's code, and a changing identity would re-apply a stale error over the user's next pick.
  const countryIdRef = useRef(countryId);
  useEffect(() => {
    countryIdRef.current = countryId;
  });

  const applyServerErrorCode = useCallback(
    (code: string | null) => {
      if (!isGeoServerCode(code)) return;
      setServerGeoCode(code);
      touchedRef.current.add('region');
      setRegionId(null);
      if (code === 'REGION_UNKNOWN') {
        void queryClient.invalidateQueries({ queryKey: regionsQueryKey(countryIdRef.current ?? -1) });
      } else if (code !== 'REGION_COUNTRY_REQUIRED') {
        touchedRef.current.add('country');
        setCountryId(null);
        void queryClient.invalidateQueries({ queryKey: countriesQueryKey });
      }
    },
    [queryClient],
  );

  // The selected country is gone (stale or deactivated since the list loaded): same treatment as a
  // rejected save, instead of the generic "couldn't load regions" line. State is adjusted while
  // rendering (not in an effect) so the stale country never paints; the effect below only refetches.
  const regionsErrorCode = regionsError ? getApiError(regionsError).code : undefined;
  if (regionsErrorCode === 'COUNTRY_NOT_FOUND' && countryId !== null) {
    setServerGeoCode('COUNTRY_NOT_FOUND');
    setCountryId(null);
    setRegionId(null);
  }
  useEffect(() => {
    if (serverGeoCode === 'COUNTRY_NOT_FOUND') {
      void queryClient.invalidateQueries({ queryKey: countriesQueryKey });
    }
  }, [serverGeoCode, queryClient]);

  const onUseMyLocation = useCallback(() => {
    setGeoHint(null);
    setServerGeoCode(null);
    setIsRequestingLocation(true);
    void requestBrowserPosition()
      .then((position) => {
        if (position.status !== 'granted') {
          setGeoHint(position.status);
          return;
        }
        setLatitude(position.latitude);
        setLongitude(position.longitude);
        return resolve({
          locales: getBrowserLocales(),
          timeZoneId: getViewerZoneId(),
          latitude: position.latitude,
          longitude: position.longitude,
        }).then(applyResolvedFields, () => {
          // Same silent-failure treatment as the mount resolve — the coordinates are still kept
          // above even if the resolve call itself failed, since the caller may still want them.
        });
      })
      .finally(() => setIsRequestingLocation(false));
  }, [resolve, applyResolvedFields]);

  return {
    languages,
    countries,
    regions,
    isReferenceLoading: isLanguagesLoading || isCountriesLoading || isRegionsLoading,
    isReferenceError: isLanguagesError || isCountriesError,
    isRegionsError,

    languageCode,
    countryId,
    regionId,
    onLanguageChange,
    onCountryChange,
    onRegionChange,

    isGeolocationSupported: isGeolocationSupported(),
    isRequestingLocation,
    geoHint,
    serverGeoCode,
    applyServerErrorCode,
    onUseMyLocation,

    latitude,
    longitude,
  };
}
