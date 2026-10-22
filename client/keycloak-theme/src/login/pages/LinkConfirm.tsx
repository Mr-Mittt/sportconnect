import type { PageProps } from 'keycloakify/login/pages/PageProps';
import { useEffect, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import type { I18n } from '../i18n';
import type { KcContext } from '../KcContext';

type Method = 'password' | 'email';

/**
 * A29: a social sign-in whose email already belongs to a password account. One page, two ways to prove the account
 * is theirs: the account's password (default) or a verification link emailed to the existing address. Keycloak's
 * stock page offered "Review profile" and "Add to existing account", which nobody could tell apart.
 * The server step is `sc-link-existing-account` (infra/keycloak-extensions); this page posts `linkMethod` (+ `password`).
 */
export default function LinkConfirm(props: PageProps<Extract<KcContext, { pageId: 'login-idp-link-confirm.ftl' }>, I18n>) {
  const { kcContext, i18n, Template } = props;
  const { url, scLink, idpAlias } = kcContext;
  const { msg, msgStr } = i18n;
  const methods: Method[] = [
    ...(scLink.hasPassword ? (['password'] as const) : []),
    ...(scLink.emailAvailable ? (['email'] as const) : []),
  ];
  const [method, setMethod] = useState<Method>(methods[0] ?? 'password');
  const [busy, setBusy] = useState(false);
  const provider = idpAlias.charAt(0).toUpperCase() + idpAlias.slice(1);

  // A wrong password comes back to this page: focus the field so the user can retype at once.
  useEffect(() => {
    if (method === 'password') document.getElementById('password')?.focus();
  }, [method]);

  useEffect(() => {
    const reset = (event: PageTransitionEvent) => {
      if (event.persisted) setBusy(false);
    };
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  const option = 'flex cursor-pointer items-start gap-2 text-sm text-text-primary';
  const radio =
    'mt-0.5 size-4 accent-accent-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0';

  return (
    <Template {...props} headerNode={msg('linkAccountTitle')}>
      <p>{msg('linkAccountIntro', scLink.email, provider)}</p>

      <form action={url.loginAction} method="post" onSubmit={() => setBusy(true)} className="mt-4">
        <input type="hidden" name="linkMethod" value={method} />
        <fieldset className="mb-5 flex flex-col gap-4">
          <legend className="sr-only">{msg('linkAccountTitle')}</legend>

          {scLink.hasPassword && (
            <div>
              <label htmlFor="link-password-option" className={option}>
                <input
                  type="radio"
                  id="link-password-option"
                  name="linkOption"
                  checked={method === 'password'}
                  onChange={() => setMethod('password')}
                  className={radio}
                />
                <span>{msg('linkUsePassword')}</span>
              </label>
              <div className="mt-2 pl-6">
                <Label htmlFor="password" className="sr-only">
                  {msg('password')}
                </Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder={msgStr('password')}
                  disabled={method !== 'password'}
                />
              </div>
            </div>
          )}

          {scLink.emailAvailable && (
            <div>
              <label htmlFor="link-email-option" className={option}>
                <input
                  type="radio"
                  id="link-email-option"
                  name="linkOption"
                  checked={method === 'email'}
                  onChange={() => setMethod('email')}
                  className={radio}
                />
                <span>{msg('linkVerifyByEmail')}</span>
              </label>
              <p className="mt-1 mb-0 pl-6 text-2xs text-text-muted">{msg('linkVerifyByEmailHint', scLink.email)}</p>
            </div>
          )}
        </fieldset>

        <Button type="submit" variant="primary" className="w-full" disabled={busy || methods.length === 0}>
          {msg('doContinue')}
        </Button>
      </form>
    </Template>
  );
}
