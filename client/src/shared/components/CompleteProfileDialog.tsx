import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { applyGeoSelection } from '@/features/profile/profileEditDraft';
import type { UserResponse } from '@/features/profile/types';
import {
  GeoLocaleCountrySelect,
  GeoLocaleLanguageField,
  GeoLocaleLocationButton,
  GeoLocaleLocationHint,
  GeoLocaleReferenceError,
  GeoLocaleRegionField,
} from '@/shared/components/GeoLocaleFields';
import { useGeoLocaleFieldsData } from '@/shared/hooks/useGeoLocaleFieldsData';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';
import { Label } from '@/shared/ui/label';
import type { AccountSettingsSavePayload } from './AccountSettingsModal';

interface CompleteProfileDialogProps {
  isOpen: boolean;
  /** The caller's profile: the country and region it already has seed the fields. */
  user: UserResponse;
  /** The stored language preference, or null; the field is pre-filled by detection when there is none. */
  languageCode: string | null;
  /** Same payload and callback shape as `AccountSettingsModal`'s Save, so `AppShell` reuses `useEditProfileSave`. */
  onSave: (payload: AccountSettingsSavePayload) => void;
  /** "Skip for now", Esc and the close action: the dialog comes back next session while the profile is incomplete. */
  onSkip: () => void;
  isSaving: boolean;
  errorMessage: string | null;
  /** A rejected country / region code from the save, shown in the hint line under the fields. */
  geoErrorCode?: string | null;
}

/**
 * AUTH-16: the "complete your profile" dialog for a user who has no country (a first-time social
 * sign-in, which skips Keycloak's register page, or a value the backend dropped at first sign-in,
 * A32) or whose country has regions but no region. Same fields as the old register form and as
 * Account Settings — country, region, language, the "use my current location" button — through the
 * same `useGeoLocaleFieldsData` (silent detection pre-fills country and language; nothing prompts
 * the browser until the button is pressed). Save needs a country; Skip is always available.
 *
 * Presentational and controlled: `AppShell` decides when it is open (`useCompleteProfilePrompt`)
 * and owns the save.
 */
export function CompleteProfileDialog({
  isOpen,
  user,
  languageCode,
  onSave,
  onSkip,
  isSaving,
  errorMessage,
  geoErrorCode = null,
}: CompleteProfileDialogProps) {
  const { t } = useTranslation('sharedDialogs');
  const { t: tCommon } = useTranslation('common');
  const geoLocale = useGeoLocaleFieldsData({
    languageCode,
    countryId: user.countryId,
    regionId: user.regionId,
  });
  const { applyServerErrorCode } = geoLocale;
  useEffect(() => {
    applyServerErrorCode(geoErrorCode);
  }, [geoErrorCode, applyServerErrorCode]);

  const profilePayload = applyGeoSelection({}, user, {
    countryId: geoLocale.countryId,
    regionId: geoLocale.regionId,
    location:
      geoLocale.latitude !== null && geoLocale.longitude !== null
        ? { latitude: geoLocale.latitude, longitude: geoLocale.longitude }
        : null,
  });
  const changedLanguageCode =
    geoLocale.languageCode !== null && geoLocale.languageCode !== languageCode
      ? geoLocale.languageCode
      : undefined;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSaving && onSkip()}>
      <DialogContent centered className="max-w-[30rem] p-4">
        <DialogTitle>{t('completeProfile.title')}</DialogTitle>
        <p className="mt-1 text-2sm text-text-secondary">{t('completeProfile.intro')}</p>
        <p className="mt-2 mb-3 rounded-lg border-hairline border-border bg-bg-accent px-3 py-2 text-2xs text-text-secondary">
          {t('completeProfile.notice')}
        </p>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            onSave({ profile: profilePayload, languageCode: changedLanguageCode });
          }}
        >
          <div className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="geo-locale-country">{tCommon('geoLocaleFields.country')}</Label>
              <div className="flex items-center gap-2">
                <GeoLocaleLocationButton
                  isGeolocationSupported={geoLocale.isGeolocationSupported}
                  isRequestingLocation={geoLocale.isRequestingLocation}
                  onUseMyLocation={geoLocale.onUseMyLocation}
                  className="shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <GeoLocaleCountrySelect
                    countries={geoLocale.countries}
                    isReferenceError={geoLocale.isReferenceError}
                    countryId={geoLocale.countryId}
                    onCountryChange={geoLocale.onCountryChange}
                  />
                </div>
              </div>
            </div>
            <div className="flex-1">
              <GeoLocaleRegionField
                regions={geoLocale.regions}
                countryId={geoLocale.countryId}
                isReferenceError={geoLocale.isReferenceError}
                isRegionsError={geoLocale.isRegionsError}
                regionId={geoLocale.regionId}
                onRegionChange={geoLocale.onRegionChange}
              />
            </div>
          </div>
          <GeoLocaleLocationHint geoHint={geoLocale.geoHint} serverGeoCode={geoLocale.serverGeoCode} />
          <GeoLocaleReferenceError isReferenceError={geoLocale.isReferenceError} />
          <GeoLocaleLanguageField
            languages={geoLocale.languages}
            isReferenceError={geoLocale.isReferenceError}
            languageCode={geoLocale.languageCode}
            onLanguageChange={geoLocale.onLanguageChange}
          />
          {errorMessage && (
            <p role="alert" className="text-2sm text-text-danger">
              {errorMessage}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="submit" size="sm" disabled={isSaving || geoLocale.countryId === null}>
              {isSaving ? t('completeProfile.saving') : t('completeProfile.save')}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onSkip} disabled={isSaving}>
              {t('completeProfile.skip')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
