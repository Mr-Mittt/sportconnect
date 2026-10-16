import DefaultPage from 'keycloakify/login/DefaultPage';
import { lazy, Suspense } from 'react';
import { classes } from './classes';
import { useI18n } from './i18n';
import type { KcContext } from './KcContext';
import Login from './pages/Login';
import Template from './Template';
import '../theme.css';

// AUTH-16: the stock profile-field renderer, plus the register page's country / region block.
const UserProfileFormFields = lazy(() => import('./components/UserProfileFormFieldsWithGeo'));

/**
 * Page switch. `login.ftl` is our own page; every other page (register, reset, update-password,
 * verify-email, IDP review profile, OTP, TOTP setup, recovery codes, error, logout confirm, page
 * expired, authenticator select, and the rest) is Keycloakify's stock page rendered inside our
 * `Template` and styled by `classes`.
 */
export default function KcPage(props: { kcContext: KcContext }) {
  const { kcContext } = props;
  const { i18n } = useI18n({ kcContext });

  return (
    <Suspense>
      {(() => {
        switch (kcContext.pageId) {
          case 'login.ftl':
            return <Login {...{ kcContext, i18n, Template, classes, doUseDefaultCss: false }} />;
          default:
            return (
              <DefaultPage
                kcContext={kcContext}
                i18n={i18n}
                classes={classes}
                Template={Template}
                doUseDefaultCss={false}
                UserProfileFormFields={UserProfileFormFields}
                doMakeUserConfirmPassword={true}
              />
            );
        }
      })()}
    </Suspense>
  );
}
