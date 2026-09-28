import { IconCurrentLocation } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocaleStore } from '@/app/localeStore';
import type { GeoHint } from '@/shared/hooks/useGeoLocaleFieldsData';
import type { CountryResponse, LanguageResponse, RegionResponse } from '@/shared/types/reference';
import { Button } from '@/shared/ui/button';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';

/**
 * CLIENT-REF-1/CLIENT-REF-2: the shared Language / Country / Region picker's building blocks, used
 * by both sign-up (CLIENT-REF-2) and profile edit (CLIENT-REF-3). Each field is its own small,
 * purely presentational and controlled component (per `client/CLAUDE.md`) rather than one fixed
 * layout — every value and mutation comes from the parent's `useGeoLocaleFieldsData()` hook (same
 * split as `LocationPicker`/`useLocationPickerData`), so each renders in Storybook with no
 * TanStack Query provider needed.
 *
 * **Split into separate components (2026-09-28, user decision):** originally one `GeoLocaleFields`
 * component rendering all three selects + the location button in a fixed arrangement. Sign-up
 * wanted Country/Region as one row directly under Full name and Language paired with Phone number
 * instead — two different places on the page — which a single fixed-layout component can't express.
 * A future consumer (CLIENT-REF-3) composes these same pieces into whatever arrangement its own
 * page wants, the same way this ticket now does, rather than this file dictating one layout for
 * every page that ever uses it.
 *
 * Country/region labels are localized client-side (`Intl.DisplayNames`/`Intl.Collator`, keyed by
 * the store's active UI locale) rather than by translating the backend's English `name` — the
 * reference data itself has no per-locale strings beyond each region's own `nativeName`.
 */

export interface GeoLocaleLanguageFieldProps {
  languages: LanguageResponse[];
  /** `languages`/`countries` failed to load — renders disabled with the `GeoLocaleReferenceError`
   * banner shown separately (the fields are optional; sign-up/profile must stay usable either way). */
  isReferenceError: boolean;
  languageCode: string | null;
  onLanguageChange: (code: string | null) => void;
}

export function GeoLocaleLanguageField({
  languages,
  isReferenceError,
  languageCode,
  onLanguageChange,
}: GeoLocaleLanguageFieldProps) {
  const { t } = useTranslation();
  return (
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
  );
}

export interface GeoLocaleCountrySelectProps {
  countries: CountryResponse[];
  isReferenceError: boolean;
  countryId: number | null;
  onCountryChange: (id: number | null) => void;
}

/**
 * Bare select, no `Label` (unlike `GeoLocaleLanguageField`/`GeoLocaleRegionField`) — sign-up puts
 * the "Country" label on its own row above a second row holding this select *and* the location
 * button side by side (user decision, 2026-09-28), so the label has to live outside this
 * component instead of being paired 1:1 with its control the way every other field here is.
 */
export function GeoLocaleCountrySelect({
  countries,
  isReferenceError,
  countryId,
  onCountryChange,
}: GeoLocaleCountrySelectProps) {
  const { t } = useTranslation();
  const locale = useLocaleStore((state) => state.locale);

  const sortedCountries = useMemo(() => {
    const displayNames = new Intl.DisplayNames([locale], { type: 'region' });
    const collator = new Intl.Collator(locale);
    return countries
      .map((country) => ({ country, label: displayNames.of(country.iso2) ?? country.name }))
      .sort((a, b) => collator.compare(a.label, b.label));
  }, [countries, locale]);

  return (
    <Select
      id="geo-locale-country"
      value={countryId !== null ? String(countryId) : ''}
      onChange={(event) => onCountryChange(event.target.value === '' ? null : Number(event.target.value))}
      disabled={isReferenceError}
    >
      <option value="">{t('geoLocaleFields.selectCountry')}</option>
      {sortedCountries.map(({ country, label }) => (
        <option key={country.id} value={country.id}>
          {label}
        </option>
      ))}
    </Select>
  );
}

export interface GeoLocaleRegionFieldProps {
  regions: RegionResponse[];
  /** `regions` is scoped to the currently selected country — `null` means no country picked yet. */
  countryId: number | null;
  isReferenceError: boolean;
  /** Only the selected country's regions failed to load — narrower than `isReferenceError`. */
  isRegionsError: boolean;
  regionId: number | null;
  onRegionChange: (id: number | null) => void;
}

export function GeoLocaleRegionField({
  regions,
  countryId,
  isReferenceError,
  isRegionsError,
  regionId,
  onRegionChange,
}: GeoLocaleRegionFieldProps) {
  const { t } = useTranslation();
  const locale = useLocaleStore((state) => state.locale);

  const hasNoRegions = countryId !== null && !isRegionsError && regions.length === 0;
  const isRegionDisabled = countryId === null || isReferenceError || isRegionsError || hasNoRegions;

  return (
    <div>
      <Label htmlFor="geo-locale-region">{t('geoLocaleFields.region')}</Label>
      <Select
        id="geo-locale-region"
        value={regionId !== null ? String(regionId) : ''}
        onChange={(event) => onRegionChange(event.target.value === '' ? null : Number(event.target.value))}
        disabled={isRegionDisabled}
      >
        <option value="">{t('geoLocaleFields.selectRegion')}</option>
        {regions.map((region) => (
          <option key={region.id} value={region.id}>
            {locale === 'vi' ? region.nativeName : region.name}
          </option>
        ))}
      </Select>
      {hasNoRegions && <p className="mt-1 text-2xs text-text-muted">{t('geoLocaleFields.noRegions')}</p>}
      {isRegionsError && (
        <p role="alert" className="mt-1 text-2xs text-text-danger">
          {t('geoLocaleFields.regionsLoadError')}
        </p>
      )}
    </div>
  );
}

export interface GeoLocaleReferenceErrorProps {
  isReferenceError: boolean;
}

/** `GET /reference/languages`/`countries` failed — a single banner shared by the Language/Country
 * fields (each already renders disabled on its own; this is the one explanatory line for both). */
export function GeoLocaleReferenceError({ isReferenceError }: GeoLocaleReferenceErrorProps) {
  const { t } = useTranslation();
  if (!isReferenceError) {
    return null;
  }
  return (
    <p role="alert" className="mb-3 text-2xs text-text-danger">
      {t('geoLocaleFields.referenceLoadError')}
    </p>
  );
}

export interface GeoLocaleLocationButtonProps {
  isGeolocationSupported: boolean;
  isRequestingLocation: boolean;
  onUseMyLocation: () => void;
  /** Extra classes for the button itself — lets a parent align it against a neighboring select
   * (e.g. `shrink-0` inside a flex row shared with `GeoLocaleCountrySelect`). */
  className?: string;
}

/**
 * Icon-only (2026-09-28, user decision) — no visible label, so it never competes with the select
 * it sits beside. The instructional copy ("Use my current location") moves to a native `title` +
 * `aria-label` (hover tooltip / screen-reader name — `SportSwitcher.tsx` already uses this same
 * `title`-attribute pattern for a hover hint, no new Tooltip primitive needed). The icon itself is
 * `text-text-accent` (the app's blue accent token, same as the "Log in" link) rather than the
 * outline button's default text color, so it reads as an action rather than plain chrome.
 *
 * Renders **only** the button — the `geoHint` result (denied/unavailable/timeout) is a separate
 * `GeoLocaleLocationHint` component, not nested inside this one's own div (2026-09-28 fix): sign-up
 * places this button in a narrow `shrink-0` flex slot beside `GeoLocaleCountrySelect`, and the
 * hint's full sentence rendered inside that same fixed-width slot forced it wide open, breaking the
 * row's layout. `GeoLocaleLocationHint` instead renders as its own full-width row wherever the
 * parent puts it (sign-up: below the whole Country/Region row).
 */
export function GeoLocaleLocationButton({
  isGeolocationSupported,
  isRequestingLocation,
  onUseMyLocation,
  className,
}: GeoLocaleLocationButtonProps) {
  const { t } = useTranslation();
  if (!isGeolocationSupported) {
    return null;
  }
  const hint = isRequestingLocation ? t('geoLocaleFields.locating') : t('geoLocaleFields.useMyLocation');
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={onUseMyLocation}
      disabled={isRequestingLocation}
      title={hint}
      aria-label={hint}
      className={className}
    >
      <IconCurrentLocation className="size-4 text-text-accent" aria-hidden="true" />
    </Button>
  );
}

export interface GeoLocaleLocationHintProps {
  geoHint: GeoHint | null;
}

/** The *result* of a "Use my current location" click (denied/unavailable/timeout) — feedback the
 * user needs to actually see, not just the button's hover hint. Renders `null` (nothing, not even
 * an empty element) until there's something to show. */
export function GeoLocaleLocationHint({ geoHint }: GeoLocaleLocationHintProps) {
  const { t } = useTranslation();
  if (!geoHint) {
    return null;
  }
  return (
    <p className="mb-3 text-2xs text-text-muted" aria-live="polite">
      {t(`geoLocaleFields.hint.${geoHint}`)}
    </p>
  );
}
