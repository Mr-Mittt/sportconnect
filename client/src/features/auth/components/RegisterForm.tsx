import { IconBrandApple, IconBrandFacebook, IconBrandGoogle, IconEye, IconEyeOff } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useLocaleStore } from '@/app/localeStore';
import { mapToSupportedLocale } from '@/shared/lib/locale';
import {
  GeoLocaleCountrySelect,
  GeoLocaleLanguageField,
  GeoLocaleLocationButton,
  GeoLocaleLocationHint,
  GeoLocaleReferenceError,
  GeoLocaleRegionField,
} from '@/shared/components/GeoLocaleFields';
import { RequiredMark } from '@/shared/components/RequiredMark';
import { useGeoLocaleFieldsData } from '@/shared/hooks/useGeoLocaleFieldsData';
import { phoneNumberInputProps } from '@/shared/lib/inputGuards';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import type { RegisterPayload } from '../types';

// Same simple shape `@Email` accepts server-side — not a full RFC 5322 parser, just enough to
// catch an obviously incomplete address before it round-trips to the server.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface RegisterFormProps {
  onSubmit: (payload: RegisterPayload) => void;
  isPending: boolean;
  errorMessage: string | null;
  /** Server `errorCode` of the failed submit (CLIENT-ERR-2), used to add a "Sign in instead" link. */
  errorCode?: string | null;
  /** Server field names of a `VALIDATION_FAILED`; the known ones are named in the banner. */
  errorFields?: string[];
}

/**
 * Presentational and controlled — RegisterPage owns the mutation, this owns
 * only the form's own field values and the password-visibility toggle
 * (ephemeral UI state). Client-side length constraints mirror
 * RegisterRequest's server-side validation (password min 8, full name max
 * 200, phone number max 20); the server response is the source of truth for
 * anything it can't check client-side (e.g. email already taken).
 *
 * **Validation is entirely custom (`noValidate` on the `<form>`), not native HTML constraint
 * validation** (2026-09-28 fix) — a browser's own "Please fill out this field" / "Please lengthen
 * this text…" popups render in the *browser's* language, never this app's `i18next` locale, so
 * switching to Vietnamese never translated them. Same `hasAttemptedSubmit` pattern
 * `CreateSessionModal.tsx` already uses: the submit button is always clickable; clicking it while
 * invalid sets `hasAttemptedSubmit` and reveals translated inline error text beside each invalid
 * field's own label (user decision — not under the input) instead of submitting, recomputed from
 * current state every render (not separate "touched" flags), so each message clears itself the
 * moment its field becomes valid. `aria-required` replaces the native `required` attribute for the
 * same a11y signal without the untranslatable popup. **The server error banner is localized**
 * (CLIENT-ERR-2): `useRegister` resolves `errorMessage` from the response's `errorCode`
 * (`EMAIL_ALREADY_REGISTERED`, `VALIDATION_FAILED`, or category copy), `errorCode` adds a "Sign in
 * instead" link for a duplicate email, and `errorFields` names the failed fields from this form's
 * own labels.
 *
 * CLIENT-REF-2: wires `useGeoLocaleFieldsData()` directly (not lifted to
 * RegisterPage — matches this form's own existing convention of owning its
 * field state locally, unlike the prop-driven LocationPicker/
 * useLocationPickerData split used inside session modals). Picking a
 * language that maps to a supported UI locale (`mapToSupportedLocale`)
 * switches the app's locale immediately via `localeStore`, so the rest of
 * the form re-renders translated — the point of offering Language on
 * sign-up. Coordinates are only ever included in the submitted payload after
 * a successful "Use my current location" click; every optional field is
 * omitted (not sent as null/empty) when unset.
 *
 * **Field layout (user decision, 2026-09-28):** Country + Region sit in one horizontal row
 * directly under Full name; Language pairs with Phone number in its own horizontal row below.
 * Country's own column is two rows: its "Country" label, then a second row with the icon-only
 * "Use my current location" button beside the select (`GeoLocaleCountrySelect`, the one field
 * rendered without its own `Label` — see `GeoLocaleFields.tsx`'s doc comment on it). This is why
 * `GeoLocaleFields.tsx` exports each field as its own small component instead of one fixed-layout
 * component — see that file's module doc. Email/Password/Full name get a visual `RequiredMark`;
 * every other field has no "(optional)" suffix, so absence of the mark is itself the signal.
 */
export function RegisterForm({ onSubmit, isPending, errorMessage, errorCode = null, errorFields = [] }: RegisterFormProps) {
  const { t } = useTranslation('register');
  const setLocale = useLocaleStore((state) => state.setLocale);
  const geoLocale = useGeoLocaleFieldsData();
  const { applyServerErrorCode } = geoLocale;

  // CLIENT-ERR-8: a rejected country / region shows in the picker's own hint line (the banner skips it).
  useEffect(() => {
    applyServerErrorCode(errorCode);
  }, [errorCode, applyServerErrorCode]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  // Server-reported failed fields (VALIDATION_FAILED), named with this form's own localized labels.
  // Keys the form has no label for (languageCode, latitude, ...) are left out of the list.
  const fieldLabels = new Map([
    ['email', t('form.email.label')],
    ['password', t('form.password.label')],
    ['fullName', t('form.fullName.label')],
    ['phoneNumber', t('form.phoneNumber.label')],
  ]);
  const failedFieldLabels = errorFields.flatMap((field) => fieldLabels.get(field) ?? []);

  const isEmailEmpty = email.trim() === '';
  const isEmailInvalid = !isEmailEmpty && !EMAIL_PATTERN.test(email.trim());
  const isPasswordTooShort = password.length < 8;
  const isFullNameEmpty = fullName.trim() === '';
  const isValid = !isEmailEmpty && !isEmailInvalid && !isPasswordTooShort && !isFullNameEmpty;

  function handleLanguageChange(code: string | null) {
    geoLocale.onLanguageChange(code);
    const mapped = mapToSupportedLocale(code);
    if (mapped) {
      setLocale(mapped);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValid) {
      setHasAttemptedSubmit(true);
      return;
    }
    onSubmit({
      email,
      password,
      fullName,
      ...(phoneNumber ? { phoneNumber } : {}),
      ...(geoLocale.languageCode ? { languageCode: geoLocale.languageCode } : {}),
      ...(geoLocale.countryId !== null ? { countryId: geoLocale.countryId } : {}),
      ...(geoLocale.regionId !== null ? { regionId: geoLocale.regionId } : {}),
      ...(geoLocale.latitude !== null && geoLocale.longitude !== null
        ? { latitude: geoLocale.latitude, longitude: geoLocale.longitude }
        : {}),
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <h1 className="mb-1 text-xl font-semibold tracking-tight text-text-primary">{t('heading')}</h1>
      <p className="mb-6 text-2sm text-text-secondary">{t('subheading')}</p>

      {errorMessage && (
        <div
          role="alert"
          className="mb-4 rounded-lg border-hairline border-border bg-bg-accent px-3 py-2 text-2sm text-text-danger"
        >
          <p>{errorMessage}</p>
          {failedFieldLabels.length > 0 && (
            <p className="mt-1">{t('form.serverError.checkFields', { fields: failedFieldLabels.join(', ') })}</p>
          )}
          {errorCode === 'EMAIL_ALREADY_REGISTERED' && (
            <p className="mt-1">
              <Link to="/login" className="font-medium underline">
                {t('form.serverError.signInInstead')}
              </Link>
            </p>
          )}
        </div>
      )}

      <div className="mb-4">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <Label htmlFor="register-email" className="mb-0">
            {t('form.email.label')}
            <RequiredMark />
          </Label>
          {hasAttemptedSubmit && isEmailEmpty && (
            <span className="text-2xs text-text-danger">{t('form.email.error.required')}</span>
          )}
          {hasAttemptedSubmit && isEmailInvalid && (
            <span className="text-2xs text-text-danger">{t('form.email.error.invalid')}</span>
          )}
        </div>
        <Input
          id="register-email"
          name="email"
          type="email"
          autoComplete="email"
          aria-required="true"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="mb-4">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <Label htmlFor="register-password" className="mb-0">
            {t('form.password.label')}
            <RequiredMark />
          </Label>
          {hasAttemptedSubmit && isPasswordTooShort && (
            <span className="text-2xs text-text-danger">{t('form.password.error.tooShort')}</span>
          )}
        </div>
        <div className="relative">
          <Input
            id="register-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            aria-required="true"
            className="pr-10"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            aria-label={showPassword ? t('form.password.hideAction') : t('form.password.showAction')}
            onClick={() => setShowPassword((prev) => !prev)}
            className="absolute top-1/2 right-1 -translate-y-1/2 cursor-pointer p-2 text-text-muted"
          >
            {showPassword ? (
              <IconEyeOff className="size-4" aria-hidden="true" />
            ) : (
              <IconEye className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <Label htmlFor="register-full-name" className="mb-0">
            {t('form.fullName.label')}
            <RequiredMark />
          </Label>
          {hasAttemptedSubmit && isFullNameEmpty && (
            <span className="text-2xs text-text-danger">{t('form.fullName.error.required')}</span>
          )}
        </div>
        <Input
          id="register-full-name"
          name="fullName"
          type="text"
          autoComplete="name"
          aria-required="true"
          maxLength={200}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
      </div>

      {/* Country + Region: one horizontal row directly under Full name, 7:5 column ratio (user
          decision — Country's column is wider since it also holds the location button). Country's
          column is two rows (user decision, 2026-09-28): the "Country" label on its own row, then
          a second row with the icon-only "Use my current location" button beside the select,
          vertically centered (`items-center`) against just the select's own height, not the label
          above it. Stacks to one column below `sm` (640px) — the AuthShell card's right panel only
          narrows below the viewport's own width starting at `md` (768px), so `sm:` is always at
          least as wide as the true container here.

          The `geoHint` result (denied/unavailable/timeout) renders as its own full-width row below
          this whole grid (`GeoLocaleLocationHint`, 2026-09-28 fix) — it used to render inside the
          button's own `shrink-0` flex slot, where a full sentence forced that fixed-width slot wide
          open and broke the row's layout. */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[7fr_5fr]">
        <div>
          {/* Explicit `common:` namespace prefix — this `t` defaults to the `register` namespace
              (see useTranslation('register') above), but this one label is the shared
              GeoLocaleFields string living in `common.json` (GeoLocaleCountrySelect has no Label
              of its own — see that component's doc comment for why). */}
          <Label htmlFor="geo-locale-country">{t('common:geoLocaleFields.country')}</Label>
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
        <GeoLocaleRegionField
          regions={geoLocale.regions}
          countryId={geoLocale.countryId}
          isReferenceError={geoLocale.isReferenceError}
          isRegionsError={geoLocale.isRegionsError}
          regionId={geoLocale.regionId}
          onRegionChange={geoLocale.onRegionChange}
        />
      </div>
      <GeoLocaleLocationHint geoHint={geoLocale.geoHint} serverGeoCode={geoLocale.serverGeoCode} />
      <GeoLocaleReferenceError isReferenceError={geoLocale.isReferenceError} />

      {/* Phone number + Language: one horizontal row, same 7:5 column ratio as Country/Region
          above (user decision) and same sm:-and-up breakpoint collapse. */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-[7fr_5fr]">
        <div>
          <Label htmlFor="register-phone-number">{t('form.phoneNumber.label')}</Label>
          <Input
            id="register-phone-number"
            name="phoneNumber"
            type="tel"
            autoComplete="tel"
            maxLength={20}
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            {...phoneNumberInputProps}
          />
        </div>
        <GeoLocaleLanguageField
          languages={geoLocale.languages}
          isReferenceError={geoLocale.isReferenceError}
          languageCode={geoLocale.languageCode}
          onLanguageChange={handleLanguageChange}
        />
      </div>

      <Button type="submit" variant="primary" className="w-full" disabled={isPending}>
        {isPending ? t('form.submitting') : t('form.submit')}
      </Button>

      <div className="my-5 flex items-center gap-3">
        <div className="border-hairline-t flex-1 border-border" />
        <span className="text-xs text-text-muted">{t('form.or')}</span>
        <div className="border-hairline-t flex-1 border-border" />
      </div>

      <div className="flex flex-col gap-2.5">
        {/* OAuth is deferred to its own ticket (client/docs/BACKLOG_MVP.md) — visually
            present for parity with Login, but non-functional until then. */}
        <Button variant="outline" className="w-full" disabled aria-disabled="true">
          <IconBrandFacebook className="size-4" aria-hidden="true" />
          {t('form.oauth.facebook')}
        </Button>
        <Button variant="outline" className="w-full" disabled aria-disabled="true">
          <IconBrandGoogle className="size-4" aria-hidden="true" />
          {t('form.oauth.google')}
        </Button>
        <Button variant="outline" className="w-full" disabled aria-disabled="true">
          <IconBrandApple className="size-4" aria-hidden="true" />
          {t('form.oauth.apple')}
        </Button>
      </div>

      <p className="mt-6 text-center text-2sm text-text-secondary">
        {t('form.alreadyHaveAccount')}{' '}
        <Link to="/login" className="text-text-accent hover:underline">
          {t('form.logIn')}
        </Link>
      </p>
    </form>
  );
}
