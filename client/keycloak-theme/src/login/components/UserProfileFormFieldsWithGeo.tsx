import StockUserProfileFormFields from 'keycloakify/login/UserProfileFormFields';
import type { UserProfileFormFieldsProps } from 'keycloakify/login/UserProfileFormFieldsProps';
import { useMemo } from 'react';
import type { I18n } from '../i18n';
import type { KcContext } from '../KcContext';
import { RegisterGeoFields, type RegisterGeoValues } from './RegisterGeoFields';

/** The realm's user-profile attributes for the zone (A32): rendered by `RegisterGeoFields`, never as plain text boxes. */
const GEO_ATTRIBUTES = ['countryId', 'regionId', 'latitude', 'longitude'] as const;

function numberOf(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * AUTH-16: Keycloakify's profile-field renderer with the four zone attributes taken out and
 * replaced by the theme's `RegisterGeoFields` block (country and region selects fed by the app's
 * reference API, plus the detect-location button). Used for every page that renders the realm's
 * profile attributes (register; the first-login review page when a required value is missing); a
 * realm that does not declare the attributes gets the stock rendering unchanged.
 */
export default function UserProfileFormFieldsWithGeo(props: UserProfileFormFieldsProps<KcContext, I18n>) {
  const { kcContext, i18n } = props;
  const attributesByName = kcContext.profile.attributesByName as Record<string, { value?: string } | undefined>;
  const hasGeoAttributes = GEO_ATTRIBUTES.some((name) => name in attributesByName);

  const withoutGeo = useMemo(() => {
    if (!hasGeoAttributes) return kcContext;
    const remaining = Object.fromEntries(
      Object.entries(kcContext.profile.attributesByName).filter(
        ([name]) => !(GEO_ATTRIBUTES as readonly string[]).includes(name),
      ),
    );
    return { ...kcContext, profile: { ...kcContext.profile, attributesByName: remaining } } as typeof kcContext;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasGeoAttributes]);

  const initial: RegisterGeoValues = {
    countryId: numberOf(attributesByName.countryId?.value),
    regionId: numberOf(attributesByName.regionId?.value),
    latitude: numberOf(attributesByName.latitude?.value),
    longitude: numberOf(attributesByName.longitude?.value),
  };
  const properties = kcContext.properties as Record<string, string | undefined>;

  return (
    <>
      {/* The stock component is typed for Keycloakify's own i18n generic, ours adds the theme keys. */}
      <StockUserProfileFormFields {...(props as UserProfileFormFieldsProps)} kcContext={withoutGeo as never} />
      {hasGeoAttributes && (
        <RegisterGeoFields
          i18n={i18n}
          apiBaseUrl={properties.SPORTCONNECT_API_BASE_URL ?? 'http://localhost:8080/api'}
          initial={initial}
        />
      )}
    </>
  );
}
