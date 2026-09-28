import { IconCurrentLocation } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocaleStore } from '@/app/localeStore';
import type { GeoHint } from '@/shared/hooks/useGeoLocaleFieldsData';
import type { CountryResponse, LanguageResponse, RegionResponse } from '@/shared/types/reference';
import { Button } from '@/shared/ui/button';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';

export interface GeoLocaleFieldsProps {
  languages: LanguageResponse[];
  countries: CountryResponse[];
  regions: RegionResponse[];
  /** `languages`/`countries` failed to load — all three selects render disabled with an error
   * hint (the fields are optional; sign-up/profile must stay usable either way). */
  isReferenceError: boolean;
  /** Only the selected country's regions failed to load — region renders disabled with its own
   * hint, language and country stay usable. */
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
}

/**
 * CLIENT-REF-1: the shared Language / Country / Region picker used by both sign-up
 * (CLIENT-REF-2) and profile edit (CLIENT-REF-3). Purely presentational and controlled per
 * `client/CLAUDE.md` — every value and mutation comes from the parent's `useGeoLocaleFieldsData()`
 * hook (same split as `LocationPicker`/`useLocationPickerData`), so this renders in Storybook with
 * no TanStack Query provider needed.
 *
 * Country/region labels are localized client-side (`Intl.DisplayNames`/`Intl.Collator`, keyed by
 * the store's active UI locale) rather than by translating the backend's English `name` — the
 * reference data itself has no per-locale strings beyond each region's own `nativeName`.
 */
export function GeoLocaleFields({
  languages,
  countries,
  regions,
  isReferenceError,
  isRegionsError,
  languageCode,
  countryId,
  regionId,
  onLanguageChange,
  onCountryChange,
  onRegionChange,
  isGeolocationSupported,
  isRequestingLocation,
  geoHint,
  onUseMyLocation,
}: GeoLocaleFieldsProps) {
  const { t } = useTranslation();
  const locale = useLocaleStore((state) => state.locale);

  const sortedCountries = useMemo(() => {
    const displayNames = new Intl.DisplayNames([locale], { type: 'region' });
    const collator = new Intl.Collator(locale);
    return countries
      .map((country) => ({ country, label: displayNames.of(country.iso2) ?? country.name }))
      .sort((a, b) => collator.compare(a.label, b.label));
  }, [countries, locale]);

  const hasNoRegions = countryId !== null && !isRegionsError && regions.length === 0;
  const isRegionDisabled = countryId === null || isReferenceError || isRegionsError || hasNoRegions;

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <Label htmlFor="geo-locale-language">{t('geoLocaleFields.language')}</Label>
        <Select
          id="geo-locale-language"
          value={languageCode ?? ''}
          onChange={(event) => onLanguageChange(event.target.value === '' ? null : event.target.value)}
          disabled={isReferenceError}
        >
          <option value="">{t('geoLocaleFields.selectLanguage')}</option>
          {languages.map((language) => (
            <option key={language.code} value={language.code}>
              {language.nativeName}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="geo-locale-country">{t('geoLocaleFields.country')}</Label>
        <Select
          id="geo-locale-country"
          value={countryId !== null ? String(countryId) : ''}
          onChange={(event) =>
            onCountryChange(event.target.value === '' ? null : Number(event.target.value))
          }
          disabled={isReferenceError}
        >
          <option value="">{t('geoLocaleFields.selectCountry')}</option>
          {sortedCountries.map(({ country, label }) => (
            <option key={country.id} value={country.id}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="geo-locale-region">{t('geoLocaleFields.region')}</Label>
        <Select
          id="geo-locale-region"
          value={regionId !== null ? String(regionId) : ''}
          onChange={(event) =>
            onRegionChange(event.target.value === '' ? null : Number(event.target.value))
          }
          disabled={isRegionDisabled}
        >
          <option value="">{t('geoLocaleFields.selectRegion')}</option>
          {regions.map((region) => (
            <option key={region.id} value={region.id}>
              {locale === 'vi' ? region.nativeName : region.name}
            </option>
          ))}
        </Select>
        {hasNoRegions && (
          <p className="mt-1 text-2xs text-text-muted">{t('geoLocaleFields.noRegions')}</p>
        )}
        {isRegionsError && (
          <p role="alert" className="mt-1 text-2xs text-text-danger">
            {t('geoLocaleFields.regionsLoadError')}
          </p>
        )}
      </div>

      {isReferenceError && (
        <p role="alert" className="text-2xs text-text-danger">
          {t('geoLocaleFields.referenceLoadError')}
        </p>
      )}

      {isGeolocationSupported && (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onUseMyLocation}
            disabled={isRequestingLocation}
          >
            <IconCurrentLocation className="size-4" aria-hidden="true" />
            {isRequestingLocation
              ? t('geoLocaleFields.locating')
              : t('geoLocaleFields.useMyLocation')}
          </Button>
          {geoHint && (
            <p className="mt-1.5 text-2xs text-text-muted" aria-live="polite">
              {t(`geoLocaleFields.hint.${geoHint}`)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
