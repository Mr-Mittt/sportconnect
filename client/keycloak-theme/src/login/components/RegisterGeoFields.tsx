import { IconCurrentLocation } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { getBrowserLocales, isGeolocationSupported, requestBrowserPosition } from '@/shared/lib/detectEnvironment';
import type { CountryResponse, RegionResponse } from '@/shared/types/reference';
import { Button } from '@/shared/ui/button';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';
import { getCountries, getRegions, resolveGeo } from '../geoApi';
import type { I18n } from '../i18n';

export interface RegisterGeoValues {
  countryId: number | null;
  regionId: number | null;
  latitude: number | null;
  longitude: number | null;
}

interface RegisterGeoFieldsProps {
  i18n: I18n;
  /** `SPORTCONNECT_API_BASE_URL`, e.g. `http://localhost:8080/api`. */
  apiBaseUrl: string;
  /** What the form already holds (a re-render after a validation error posts the values back). */
  initial: RegisterGeoValues;
}

type GeoHint = 'denied' | 'unavailable' | 'timeout';

/**
 * AUTH-16: the register page's optional "zone" block — country, region, and the "use my current
 * location" button — in the old register form's layout (the button beside the country select, the
 * region next to it). The chosen values travel as the user-profile attributes `countryId`,
 * `regionId`, `latitude` and `longitude`, posted by plain inputs with those names; the backend reads
 * them from the token at the first sign-in (A32) and drops any value it cannot use.
 *
 * Like the app's own form it silently pre-fills the country from the browser's language and
 * time zone (no permission prompt) and only asks for the position when the button is pressed. It
 * never blocks the form: if the API cannot be reached the selects say so and registration goes on.
 */
export function RegisterGeoFields({ i18n, apiBaseUrl, initial }: RegisterGeoFieldsProps) {
  const { msgStr } = i18n;
  const [countries, setCountries] = useState<CountryResponse[]>([]);
  // The regions of the country they were loaded for: a different country (or none) simply has no entry
  // yet, so nothing needs resetting inside an effect.
  const [regionState, setRegionState] = useState<{ countryId: number; list: RegionResponse[]; failed: boolean } | null>(
    null,
  );
  const [countryId, setCountryId] = useState<number | null>(initial.countryId);
  const [regionId, setRegionId] = useState<number | null>(initial.regionId);
  const [latitude, setLatitude] = useState<number | null>(initial.latitude);
  const [longitude, setLongitude] = useState<number | null>(initial.longitude);
  const [isReferenceError, setIsReferenceError] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [hint, setHint] = useState<GeoHint | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCountries(apiBaseUrl).then(
      (list) => !cancelled && setCountries(list),
      () => !cancelled && setIsReferenceError(true),
    );
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);

  // Silent pre-fill, once: browser language + time zone only; never overrides a value already chosen.
  useEffect(() => {
    if (initial.countryId !== null) return;
    let cancelled = false;
    resolveGeo(apiBaseUrl, {
      locales: getBrowserLocales().slice(0, 10),
      timeZoneId: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }).then(
      (resolved) => {
        if (!cancelled && resolved.country !== null) {
          setCountryId((current) => current ?? resolved.country!.id);
        }
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, initial.countryId]);

  useEffect(() => {
    if (countryId === null) return;
    let cancelled = false;
    getRegions(apiBaseUrl, countryId).then(
      (list) => !cancelled && setRegionState({ countryId, list, failed: false }),
      () => !cancelled && setRegionState({ countryId, list: [], failed: true }),
    );
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, countryId]);

  const currentRegions = regionState !== null && regionState.countryId === countryId ? regionState : null;
  const regions = currentRegions?.list ?? [];
  const isRegionsError = currentRegions?.failed ?? false;

  async function useMyLocation() {
    setHint(null);
    setIsLocating(true);
    const position = await requestBrowserPosition();
    if (position.status !== 'granted') {
      setHint(position.status);
      setIsLocating(false);
      return;
    }
    setLatitude(position.latitude);
    setLongitude(position.longitude);
    try {
      const resolved = await resolveGeo(apiBaseUrl, {
        latitude: position.latitude,
        longitude: position.longitude,
        locales: getBrowserLocales().slice(0, 10),
        timeZoneId: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (resolved.country !== null) {
        setCountryId(resolved.country.id);
        setRegionId(resolved.region?.id ?? null);
      }
    } catch {
      // The coordinates are kept; the user can still pick the zone by hand.
    }
    setIsLocating(false);
  }

  const locationLabel = isLocating ? msgStr('geoLocating') : msgStr('geoUseMyLocation');

  return (
    <div className="mb-4" data-testid="register-geo-fields">
      <p className="mb-2 text-2xs text-text-muted">{msgStr('geoOptionalNote')}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="kc-geo-country">{msgStr('geoCountry')}</Label>
          <div className="flex items-center gap-2">
            {isGeolocationSupported() && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={useMyLocation}
                disabled={isLocating}
                title={locationLabel}
                aria-label={locationLabel}
              >
                <IconCurrentLocation className="size-4 text-text-accent" aria-hidden="true" />
              </Button>
            )}
            <Select
              id="kc-geo-country"
              className="min-w-0 flex-1"
              value={countryId === null ? '' : String(countryId)}
              onChange={(event) => {
                setCountryId(event.target.value === '' ? null : Number(event.target.value));
                setRegionId(null);
              }}
            >
              <option value="">{msgStr('geoSelectCountry')}</option>
              {countries.map((country) => (
                <option key={country.id} value={country.id}>
                  {country.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="kc-geo-region">{msgStr('geoRegion')}</Label>
          <Select
            id="kc-geo-region"
            value={regionId === null ? '' : String(regionId)}
            disabled={countryId === null || regions.length === 0}
            onChange={(event) => setRegionId(event.target.value === '' ? null : Number(event.target.value))}
          >
            <option value="">
              {countryId !== null && regions.length === 0 && !isRegionsError
                ? msgStr('geoNoRegions')
                : msgStr('geoSelectRegion')}
            </option>
            {regions.map((region) => (
              <option key={region.id} value={region.id}>
                {region.nativeName || region.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {hint !== null && (
        <p className="mt-2 text-2xs text-text-muted" aria-live="polite">
          {msgStr(hint === 'denied' ? 'geoHintDenied' : hint === 'unavailable' ? 'geoHintUnavailable' : 'geoHintTimeout')}
        </p>
      )}
      {isReferenceError && (
        <p className="mt-2 text-2xs text-text-muted" aria-live="polite">
          {msgStr('geoReferenceLoadError')}
        </p>
      )}
      {isRegionsError && (
        <p className="mt-2 text-2xs text-text-muted" aria-live="polite">
          {msgStr('geoRegionsLoadError')}
        </p>
      )}

      {/* Posted with the form as the user-profile attributes; omitted while empty so Keycloak's
          validators never see a blank value. */}
      {countryId !== null && <input type="hidden" name="countryId" value={countryId} />}
      {countryId !== null && regionId !== null && <input type="hidden" name="regionId" value={regionId} />}
      {latitude !== null && longitude !== null && (
        <>
          <input type="hidden" name="latitude" value={latitude} />
          <input type="hidden" name="longitude" value={longitude} />
        </>
      )}
    </div>
  );
}
