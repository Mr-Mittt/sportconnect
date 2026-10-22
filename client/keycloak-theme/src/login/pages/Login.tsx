import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { kcSanitize } from 'keycloakify/lib/kcSanitize';
import type { PageProps } from 'keycloakify/login/pages/PageProps';
import { useEffect, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { ProviderButtons } from '../components/ProviderButtons';
import type { I18n } from '../i18n';
import type { KcContext } from '../KcContext';

/**
 * The /login card. The client's `LoginForm` is not reusable here (it owns client state and
 * react-i18next), so this page rebuilds it on the same primitives (A24).
 */
export default function Login(props: PageProps<Extract<KcContext, { pageId: 'login.ftl' }>, I18n>) {
  const { kcContext, i18n, Template } = props;
  const { social, realm, url, usernameHidden, login, auth, registrationDisabled, messagesPerField } =
    kcContext;
  const { msg, msgStr } = i18n;
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const hasError = messagesPerField.existsError('username', 'password');

  // Coming back to this page with the browser's back button restores it from the bfcache with the
  // submit button still disabled.
  useEffect(() => {
    const reset = (event: PageTransitionEvent) => {
      if (event.persisted) setBusy(false);
    };
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  // The username is not something the user picks (the register page hides it; Keycloak fills it with the
  // email), so the field is labelled "Email". The phone-or-email wording waits for phone registration (AUTH-18).
  const usernameLabel = realm.loginWithEmailAllowed ? msg('email') : msg('username');

  return (
    <Template
      {...props}
      displayMessage={!hasError}
      headerNode={
        <>
          {msg('loginAccountTitle')}
          <span className="mt-1 block text-2sm font-normal tracking-normal text-text-secondary">
            {msg('loginAccountSubtitle')}
          </span>
        </>
      }
      displayInfo={realm.password && realm.registrationAllowed && !registrationDisabled}
      infoNode={
        <span>
          {msg('noAccount')}{' '}
          <a href={url.registrationUrl} className="text-text-accent hover:underline">
            {msg('doRegister')}
          </a>
        </span>
      }
      socialProvidersNode={
        realm.password && social?.providers?.length ? (
          <ProviderButtons providers={social.providers} i18n={i18n} />
        ) : null
      }
    >
      {realm.password && (
        <form id="kc-form-login" action={url.loginAction} method="post" onSubmit={() => setBusy(true)}>
          {!usernameHidden && (
            <div className="mb-4">
              <Label htmlFor="username">{usernameLabel}</Label>
              <Input
                id="username"
                name="username"
                type="text"
                defaultValue={login.username ?? ''}
                autoComplete="username"
                aria-invalid={hasError}
              />
            </div>
          )}

          <div className="mb-5">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <Label htmlFor="password" className="mb-0">
                {msg('password')}
              </Label>
              {realm.resetPasswordAllowed && (
                <a href={url.loginResetCredentialsUrl} className="text-2xs text-text-accent hover:underline">
                  {msg('doForgotPassword')}
                </a>
              )}
            </div>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                className="pr-10"
                aria-invalid={hasError}
              />
              <button
                type="button"
                aria-label={msgStr(showPassword ? 'hidePassword' : 'showPassword')}
                onClick={() => setShowPassword((value) => !value)}
                className="absolute top-1/2 right-1 -translate-y-1/2 cursor-pointer p-2 text-text-muted hover:text-text-primary"
              >
                {showPassword ? (
                  <IconEyeOff className="size-4" aria-hidden="true" />
                ) : (
                  <IconEye className="size-4" aria-hidden="true" />
                )}
              </button>
            </div>
            {hasError && (
              <p
                role="alert"
                className="mt-1.5 text-2xs text-text-danger"
                dangerouslySetInnerHTML={{
                  __html: kcSanitize(messagesPerField.getFirstError('username', 'password')),
                }}
              />
            )}
          </div>

          <input type="hidden" name="credentialId" value={auth.selectedCredential} />
          <Button type="submit" name="login" id="kc-login" variant="primary" className="w-full" disabled={busy}>
            {busy ? msg('doLoggingIn') : msg('doLogIn')}
          </Button>
        </form>
      )}
    </Template>
  );
}
