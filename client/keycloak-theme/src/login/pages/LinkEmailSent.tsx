import type { PageProps } from 'keycloakify/login/pages/PageProps';
import { useEffect, useState } from 'react';
import { Button } from '@/shared/ui/button';
import type { I18n } from '../i18n';
import type { KcContext } from '../KcContext';

/**
 * A29: the verification email for linking a social sign-in has been sent. Resend is allowed once a minute (the server
 * enforces the same wait); "Back to log in" restarts the flow and the login page pre-fills the account's email.
 */
export default function LinkEmailSent(props: PageProps<Extract<KcContext, { pageId: 'login-idp-link-email.ftl' }>, I18n>) {
  const { kcContext, i18n, Template } = props;
  const { url, scLink } = kcContext;
  const { msg } = i18n;
  const [remaining, setRemaining] = useState(scLink.resendIn);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setRemaining((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [remaining]);

  useEffect(() => {
    const reset = (event: PageTransitionEvent) => {
      if (event.persisted) setBusy(false);
    };
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  return (
    <Template {...props} headerNode={msg('linkEmailSentTitle')}>
      <p>{msg('linkEmailSentBody', scLink.email)}</p>

      <div className="mt-5 flex flex-col gap-2">
        <form action={url.loginAction} method="post" onSubmit={() => setBusy(true)}>
          <input type="hidden" name="linkMethod" value="resend" />
          <Button type="submit" variant="primary" className="w-full" disabled={busy || remaining > 0}>
            {remaining > 0 ? msg('linkResendIn', String(remaining)) : msg('linkResend')}
          </Button>
        </form>
        <Button asChild variant="outline" className="w-full">
          <a href={url.loginRestartFlowUrl}>{msg('linkBackToLogin')}</a>
        </Button>
      </div>
    </Template>
  );
}
