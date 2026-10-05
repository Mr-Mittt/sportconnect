import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  applyGeoSelection,
  buildProfileUpdatePayload,
  toProfileEditDraft,
  type ProfileEditDraft,
  type UpdateProfilePayload,
} from '@/features/profile/profileEditDraft';
import { GENDERS, MAX_BIO_LENGTH, type UserResponse } from '@/features/profile/types';
import {
  GeoLocaleCountrySelect,
  GeoLocaleLanguageField,
  GeoLocaleLocationButton,
  GeoLocaleLocationHint,
  GeoLocaleReferenceError,
  GeoLocaleRegionField,
} from '@/shared/components/GeoLocaleFields';
import { useGeoLocaleFieldsData } from '@/shared/hooks/useGeoLocaleFieldsData';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import { digitsOnlyInputProps, phoneNumberInputProps } from '@/shared/lib/inputGuards';
import { cn } from '@/shared/lib/utils';
import { Button, POST_BUTTON_DISABLED_OVERRIDE } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';

/** What `AccountSettingsModal` hands its parent on Save — a profile-field payload (may be empty) plus
 * an optional language code, present only when it actually changed from the seeded preference.
 * `AppShell`'s `useEditProfileSave` fires whichever half is non-empty/defined. */
export interface AccountSettingsSavePayload {
  profile: UpdateProfilePayload;
  languageCode?: string;
}

interface AccountSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserResponse;
  /** The caller's current language preference (`UserPreferenceResponse.language`), for seeding —
   * not editable here except through this modal's own Language field. */
  languageCode: string | null;
  onSave: (payload: AccountSettingsSavePayload) => void;
  isSaving: boolean;
  errorMessage: string | null;
  /** CLIENT-I18N-6 convention: `"namespace:key.path"` override for the copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
}

/**
 * ACCOUNT-1's Account Settings modal, opened from `TopBar`'s avatar dropdown. It took over
 * everything PROFILE-5's Edit Profile modal used to edit except avatar/cover (those stay in
 * `EditProfileModal`). Presentational and controlled, same shape as
 * `AddSportModal`/`CreateGroupModal`: the parent owns `useEditProfileSave()`
 * and passes `onSave`/`isSaving`/`errorMessage` down. Resets on every *open*
 * via a changing `key` prop from the parent (same reasoning as
 * `AddSportModal`/`CreateGroupModal` — avoids a setState-in-effect reset).
 *
 * Fields cover every non-sport-profile `UpdateProfileRequest` field —
 * widened at pickup (2026-08-27, user decision) from the original 8 to all
 * 14, since the extra 6 (`phoneNumber`/`dateOfBirth`/`gender`/`heightCm`/
 * `weightKg`/`shoeSizeMm`) live on the exact same row/endpoint. See the
 * ticket doc's Delta for the full reasoning.
 *
 * **CLIENT-REF-3:** the free-text City input is gone — `GeoLocaleCountrySelect`/
 * `GeoLocaleRegionField`/`GeoLocaleLanguageField`/the location button (the same shared building
 * blocks sign-up/`RegisterForm` uses) take its place, via `useGeoLocaleFieldsData` wired directly
 * here — same "owns its own field state locally" precedent `RegisterForm` already set, not lifted
 * to `ProfilePage`. Seeded from `user.countryId`/`regionId` and the `languageCode` prop, each
 * pre-marked touched when non-null (see `useGeoLocaleFieldsData`'s `initial` param) so the mount's
 * silent geo-resolve never silently overwrites an already-stored choice. Language is a preference,
 * not a profile field — `onSave` reports it separately from `profile`, only when it actually
 * changed, so the parent can save it via its own `PUT /users/me/preferences` call in the same Save
 * action without conflating the two endpoints' error states.
 */
export function AccountSettingsModal({
  isOpen,
  onClose,
  user,
  languageCode,
  onSave,
  isSaving,
  errorMessage,
  i18nOverridePrefix,
}: AccountSettingsModalProps) {
  const t = useOverridableText('accountSettings', i18nOverridePrefix);
  const { t: tCommon } = useTranslation('common');
  const { t: tEnums } = useTranslation('enums');
  const [draft, setDraft] = useState<ProfileEditDraft>(() => toProfileEditDraft(user));
  const geoLocale = useGeoLocaleFieldsData({
    languageCode,
    countryId: user.countryId,
    regionId: user.regionId,
  });

  const set = <K extends keyof ProfileEditDraft>(key: K, value: ProfileEditDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const textPayload = buildProfileUpdatePayload(user, draft);
  const profilePayload = applyGeoSelection(textPayload, user, {
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
  const isDirty = Object.keys(profilePayload).length > 0 || changedLanguageCode !== undefined;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent fixedHeight fixedHeightVh={72} className="max-w-[35rem]">
        <DialogHeader title={t('title')} className="border-hairline-b border-border px-4 py-3" />
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            onSave({ profile: profilePayload, languageCode: changedLanguageCode });
          }}
        >
          <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-3.5">
            <h4 className="text-2sm font-semibold text-text-secondary">{t('section.profile')}</h4>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label htmlFor="account-settings-first-name">{t('field.firstName')}</Label>
                <Input
                  id="account-settings-first-name"
                  value={draft.firstName}
                  onChange={(event) => set('firstName', event.target.value)}
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="account-settings-last-name">{t('field.lastName')}</Label>
                <Input
                  id="account-settings-last-name"
                  value={draft.lastName}
                  onChange={(event) => set('lastName', event.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="account-settings-username">{t('field.username')}</Label>
              <Input
                id="account-settings-username"
                value={draft.username}
                onChange={(event) => set('username', event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="account-settings-bio">{t('field.bio')}</Label>
              <Textarea
                id="account-settings-bio"
                value={draft.bio}
                maxLength={MAX_BIO_LENGTH}
                onChange={(event) => set('bio', event.target.value.slice(0, MAX_BIO_LENGTH))}
              />
              <p className="mt-1 text-right text-2xs text-text-muted">
                {draft.bio.length}/{MAX_BIO_LENGTH}
              </p>
            </div>

            {/* CLIENT-REF-3: Country + Region replace the old free-text City/Country row — same
                icon-button-beside-select composition RegisterForm uses (GeoLocaleCountrySelect has
                no Label of its own, see that component's doc comment). Legacy-unmatched-text edge
                case: user.countryId === null but user.country holds old free text — shown read-only
                above the (empty) select until a real country is picked. */}
            <div className="flex gap-3">
              <div className="flex-1">
                <Label htmlFor="geo-locale-country">{tCommon('geoLocaleFields.country')}</Label>
                {user.countryId === null && user.country !== null && (
                  <p className="mb-1 text-2xs text-text-muted">{t('legacyCountry', { country: user.country })}</p>
                )}
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
            <GeoLocaleLocationHint geoHint={geoLocale.geoHint} />
            <GeoLocaleReferenceError isReferenceError={geoLocale.isReferenceError} />

            <h4 className="mt-1 text-2sm font-semibold text-text-secondary">{t('section.contact')}</h4>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label htmlFor="account-settings-phone-number">{t('field.phoneNumber')}</Label>
                <Input
                  id="account-settings-phone-number"
                  value={draft.phoneNumber}
                  maxLength={20}
                  type="tel"
                  {...phoneNumberInputProps}
                  onChange={(event) => set('phoneNumber', event.target.value)}
                />
              </div>
              {/* CLIENT-REF-3: Language pairs with Phone number, same pairing RegisterForm uses. */}
              <div className="flex-1">
                <GeoLocaleLanguageField
                  languages={geoLocale.languages}
                  isReferenceError={geoLocale.isReferenceError}
                  languageCode={geoLocale.languageCode}
                  onLanguageChange={geoLocale.onLanguageChange}
                />
              </div>
            </div>

            <h4 className="mt-1 text-2sm font-semibold text-text-secondary">{t('section.personal')}</h4>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label htmlFor="account-settings-date-of-birth">{t('field.dateOfBirth')}</Label>
                <Input
                  id="account-settings-date-of-birth"
                  type="date"
                  value={draft.dateOfBirth}
                  onChange={(event) => set('dateOfBirth', event.target.value)}
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="account-settings-gender">{t('field.gender')}</Label>
                <Select
                  id="account-settings-gender"
                  value={draft.gender}
                  onChange={(event) => set('gender', event.target.value)}
                >
                  <option value="">{tEnums('gender.unspecified')}</option>
                  {GENDERS.map((gender) => (
                    <option key={gender} value={gender}>
                      {tEnums(`gender.${gender}`)}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label htmlFor="account-settings-height">{t('field.heightCm')}</Label>
                <Input
                  id="account-settings-height"
                  type="number"
                  {...digitsOnlyInputProps}
                  min={50}
                  max={300}
                  value={draft.heightCm}
                  onChange={(event) => set('heightCm', event.target.value)}
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="account-settings-weight">{t('field.weightKg')}</Label>
                <Input
                  id="account-settings-weight"
                  type="number"
                  {...digitsOnlyInputProps}
                  min={20}
                  max={300}
                  value={draft.weightKg}
                  onChange={(event) => set('weightKg', event.target.value)}
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="account-settings-shoe-size">{t('field.shoeSizeMm')}</Label>
                <Input
                  id="account-settings-shoe-size"
                  type="number"
                  {...digitsOnlyInputProps}
                  min={10}
                  max={500}
                  value={draft.shoeSizeMm}
                  onChange={(event) => set('shoeSizeMm', event.target.value)}
                />
              </div>
            </div>

            {errorMessage !== null && (
              <p role="alert" className="text-2sm text-text-danger">
                {errorMessage}
              </p>
            )}
          </div>

          <div className="border-hairline-t flex justify-end border-border px-4 py-3">
            <Button
              type="submit"
              variant="primary"
              disabled={!isDirty || isSaving}
              className={cn('cursor-pointer disabled:cursor-default', POST_BUTTON_DISABLED_OVERRIDE)}
            >
              {isSaving ? t('saving') : t('save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
