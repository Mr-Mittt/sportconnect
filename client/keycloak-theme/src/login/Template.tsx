import { IconAlertCircle, IconCircleCheck, IconInfoCircle } from '@tabler/icons-react';
import { kcSanitize } from 'keycloakify/lib/kcSanitize';
import { useInitialize } from 'keycloakify/login/Template.useInitialize';
import type { TemplateProps } from 'keycloakify/login/TemplateProps';
import { useSetClassName } from 'keycloakify/tools/useSetClassName';
import { useEffect } from 'react';
import { AuthShell } from '@/features/auth/components/AuthShell';
import earthUrl from '../../../public/earth.png';
import type { I18n } from './i18n';
import type { KcContext } from './KcContext';

const messageIcon = {
  success: IconCircleCheck,
  info: IconInfoCircle,
  warning: IconAlertCircle,
  error: IconAlertCircle,
} as const;

/**
 * The client's own two-column card (`AuthShell`) around every Keycloak page: heading, language
 * links, the server message as an alert, the page body, "try another way", social providers, info.
 */
export default function Template(props: TemplateProps<KcContext, I18n>) {
  const {
    displayInfo = false,
    displayMessage = true,
    headerNode,
    socialProvidersNode = null,
    infoNode = null,
    documentTitle,
    kcContext,
    i18n,
    doUseDefaultCss,
    children,
  } = props;
  const { msg, msgStr, enabledLanguages, currentLanguage } = i18n;
  const { realm, auth, url, message, isAppInitiatedAction } = kcContext;

  useEffect(() => {
    document.title = documentTitle ?? msgStr('loginTitle', realm.displayName || realm.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- set once per page load, like Keycloak's own template
  }, []);

  // Keycloakify's stock pages hard-code `tabindex="1"`/`"2"`/... on fields and buttons (OTP, recovery
  // codes, logout confirm). A positive tabindex overrides the natural DOM order for keyboard users
  // (axe: "tabindex" serious), and our layout already puts the controls in reading order, so drop it.
  useEffect(() => {
    document.querySelectorAll<HTMLElement>('[tabindex]').forEach((element) => {
      if (Number(element.getAttribute('tabindex')) > 0) element.removeAttribute('tabindex');
    });
  });

  useSetClassName({ qualifiedName: 'html', className: '' });
  useSetClassName({ qualifiedName: 'body', className: '' });

  const { isReadyToRender } = useInitialize({ kcContext, doUseDefaultCss });
  if (!isReadyToRender) return null;

  const showAttemptedUser = auth !== undefined && auth.showUsername && !auth.showResetCredentials;
  const Icon = message ? messageIcon[message.type] : IconInfoCircle;

  return (
    <AuthShell tagline={msgStr('sportconnectTagline')} earthSrc={earthUrl}>
      {enabledLanguages.length > 1 && (
        <nav
          className="mb-4 flex justify-end gap-3 text-2xs text-text-muted"
          aria-label={msgStr('languages')}
        >
          {enabledLanguages.map((language) => {
            const current = language.languageTag === currentLanguage.languageTag;
            return (
              <a
                key={language.languageTag}
                href={language.href}
                lang={language.languageTag}
                aria-current={current ? 'true' : undefined}
                className={current ? 'font-semibold text-text-primary' : 'hover:underline'}
              >
                {language.label}
              </a>
            );
          })}
        </nav>
      )}

      {showAttemptedUser ? (
        <div className="mb-4 flex items-center gap-2 text-sm text-text-primary">
          <span>{auth.attemptedUsername}</span>
          <a
            href={url.loginRestartFlowUrl}
            aria-label={msgStr('restartLoginTooltip')}
            className="text-2xs text-text-accent hover:underline"
          >
            {msg('restartLoginTooltip')}
          </a>
        </div>
      ) : (
        <h1 className="mb-4 text-xl font-semibold tracking-tight text-text-primary">
          {headerNode}
        </h1>
      )}

      {displayMessage &&
        message !== undefined &&
        (message.type !== 'warning' || !isAppInitiatedAction) && (
          <div
            role={message.type === 'error' ? 'alert' : 'status'}
            className={`mb-4 flex items-start gap-2 rounded-lg border-hairline border-border bg-bg-accent px-3 py-2 text-2sm ${message.type === 'error' ? 'text-text-danger' : 'text-text-primary'}`}
          >
            <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span dangerouslySetInnerHTML={{ __html: kcSanitize(message.summary) }} />
          </div>
        )}

      {/* Stock pages bring bare paragraphs, lists and links: give them the card's body type. */}
      <div className="text-2sm leading-relaxed text-text-secondary [&_a:not([class])]:text-text-accent [&_a:not([class])]:hover:underline [&_p+p]:mt-2 [&_p]:mb-3">
        {children}
      </div>

      {auth !== undefined && auth.showTryAnotherWayLink && (
        <form
          id="kc-select-try-another-way-form"
          action={url.loginAction}
          method="post"
          className="mt-4"
        >
          <input type="hidden" name="tryAnotherWay" value="on" />
          <button
            type="submit"
            id="try-another-way"
            className="cursor-pointer text-2sm text-text-accent hover:underline"
          >
            {msg('doTryAnotherWay')}
          </button>
        </form>
      )}

      {socialProvidersNode}

      {displayInfo && (
        <div id="kc-info" className="mt-6 text-center text-2sm text-text-secondary">
          {infoNode}
        </div>
      )}
    </AuthShell>
  );
}
