import { useCallback, useEffect, useRef, useState } from 'react';
import { getBrowserLocales, isGeolocationSupported, requestBrowserPosition } from '@/shared/lib/detectEnvironment';
import { getViewerZoneId } from '@/shared/lib/viewerZone';
import type { CountryResponse, LanguageResponse, RegionResponse } from '@/shared/types/reference';
import { useCountries } from './useCountries';
import { useLanguages } from './useLanguages';
import { useRegions } from './useRegions';
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
  onUseMyLocation: () => void;

  /** Coordinates from a successful "Use my current location" click — `null` until one succeeds.
   * Kept here, not just applied internally, so the page embedding this (CLIENT-REF-2/3) can send
   * them along with the rest of its own submission; this hook never persists anything itself. */
  latitude: number | null;
  longitude: number | null;
}

/**
 * CLIENT-REF-1: the page-level data hook behind `GeoLocaleFields` — composes the four reference
 * hooks, runs the one-time silent (locales + timezone) resolve on mount, and owns the "Use my
 * current location" button's flow. Shared verbatim by sign-up (CLIENT-REF-2, anonymous) and
 * profile edit (CLIENT-REF-3, authenticated) — neither passes any per-caller option in, since the
 * resolve endpoint and every reference read are public and caller-agnostic.
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
 * only fires when `languageCode` is still `null` (an already-set value, however it got set, is
 * left alone) and only when that code names a currently active language.
 */
export function useGeoLocaleFieldsData(): GeoLocaleFieldsData {
  const { data: languages, isLoading: isLanguagesLoading, isError: isLanguagesError } = useLanguages();
  const { data: countries, isLoading: isCountriesLoading, isError: isCountriesError } = useCountries();

  const [languageCode, setLanguageCode] = useState<string | null>(null);
  const [countryId, setCountryId] = useState<number | null>(null);
  const [regionId, setRegionId] = useState<number | null>(null);
  const touchedRef = useRef<Set<TouchedField>>(new Set());

  const { data: regions, isLoading: isRegionsLoading, isError: isRegionsError } = useRegions(countryId);

  const { resolve } = useResolveGeo();
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);
  const [geoHint, setGeoHint] = useState<GeoHint | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  /** Applies a resolve result, honoring `touchedRef` — shared by the silent mount resolve and the
   * coordinate-triggered one from the location button; the only difference between the two is
   * which signals go into the request, not how the response gets applied. */
  const applyResolvedFields = useCallback(
    (result: { language: LanguageResponse | null; country: CountryResponse | null; region: RegionResponse | null }) => {
      const touched = touchedRef.current;
      if (result.language && !touched.has('language')) {
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
  // written (e.g. `useSessionBootstrap`).
  useEffect(() => {
    void resolve({ locales: getBrowserLocales(), timeZoneId: getViewerZoneId() }).then(
      applyResolvedFields,
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
      setCountryId(id);
      setRegionId(null);

      if (id === null || languageCode !== null) {
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
    [countries, languages, languageCode],
  );

  const onRegionChange = useCallback((id: number | null) => {
    touchedRef.current.add('region');
    setRegionId(id);
  }, []);

  const onUseMyLocation = useCallback(() => {
    setGeoHint(null);
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
    onUseMyLocation,

    latitude,
    longitude,
  };
}
