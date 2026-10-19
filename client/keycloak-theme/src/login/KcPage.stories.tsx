import type { Meta, StoryObj } from '@storybook/react-vite';
import type { KcContext } from './KcContext';
import { KcPageStory } from './KcPageStory';

/*
 * One story per page and visual state. The locale toolbar (.storybook/preview.ts) switches en/vi;
 * e2e/visual/auth-theme.spec.ts and e2e/theme/auth-theme-a11y.spec.ts walk every story listed in
 * the built Storybook's index.json, so a new story here is captured and axe-checked automatically.
 */
const meta = {
  title: 'login/pages',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;
export default meta;

type Story = StoryObj;

const providers = [
  { loginUrl: '#', alias: 'google', providerId: 'google', displayName: 'Google', iconClasses: '' },
  { loginUrl: '#', alias: 'facebook', providerId: 'facebook', displayName: 'Facebook', iconClasses: '' },
  { loginUrl: '#', alias: 'zalo', providerId: 'oidc', displayName: 'Zalo', iconClasses: '' },
];

/*
 * AUTH-16: the register page's zone block reads the app's public reference API. Storybook has none,
 * so `fetch` answers those calls here (same idea as the client stories mocking `apiClient`); the
 * broken host below stands for an API that cannot be reached.
 */
const BROKEN_API = 'http://broken.invalid/api';
const referenceJson = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: true, message: '', data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (!url.includes('/reference/')) return realFetch(input, init);
  if (url.startsWith(BROKEN_API)) return Promise.resolve(referenceJson(null, 503));
  if (url.endsWith('/reference/resolve')) {
    return Promise.resolve(referenceJson({ language: null, country: null, region: null, source: null }));
  }
  if (/\/reference\/countries\/\d+\/regions$/.test(url)) {
    return Promise.resolve(
      referenceJson([
        { id: 101, countryId: 1, isoCode: 'VN-HN', name: 'Hanoi', nativeName: 'Hà Nội' },
        { id: 102, countryId: 1, isoCode: 'VN-SG', name: 'Ho Chi Minh City', nativeName: 'Hồ Chí Minh' },
      ]),
    );
  }
  return Promise.resolve(
    referenceJson([{ id: 1, iso2: 'VN', iso3: 'VNM', name: 'Vietnam', defaultLanguageCode: 'vi' }]),
  );
}) as typeof fetch;

/** The realm's zone attributes (A32); the register page renders them through its own block. */
const zoneAttributes = {
  countryId: { name: 'countryId', value: '' },
  regionId: { name: 'regionId', value: '' },
  latitude: { name: 'latitude', value: '' },
  longitude: { name: 'longitude', value: '' },
};

function story(pageId: KcContext['pageId'], kcContext?: object): Story {
  return {
    render: (_args, context) => (
      <KcPageStory
        pageId={pageId}
        kcContext={kcContext as never}
        locale={(context.globals.locale as string | undefined) ?? 'en'}
      />
    ),
  };
}

const fieldErrors = (errors: Record<string, string>) => ({
  messagesPerField: {
    existsError: (...names: string[]) => names.some((name) => name in errors),
    getFirstError: (...names: string[]) => errors[names.find((name) => name in errors) ?? ''] ?? '',
    printIfExists: () => undefined,
    exists: (name: string) => name in errors,
    get: (name: string) => errors[name] ?? '',
  },
});

export const Login = story('login.ftl', { social: { providers } });
export const LoginWithoutProviders = story('login.ftl', { social: { providers: [] } });
export const LoginWrongPassword = story('login.ftl', {
  social: { providers },
  ...fieldErrors({ username: 'Invalid username or password.', password: 'Invalid username or password.' }),
});
export const Register = story('register.ftl', { profile: { attributesByName: zoneAttributes } });
/** The reference API cannot be reached: the zone block says so and the form stays usable. */
export const RegisterZoneUnavailable = story('register.ftl', {
  profile: { attributesByName: zoneAttributes },
  properties: { SPORTCONNECT_API_BASE_URL: BROKEN_API },
});
export const RegisterWithErrors = story('register.ftl', {
  profile: {
    attributesByName: {
      ...zoneAttributes,
      email: { value: 'not-an-email', validationErrors: [{ message: 'Invalid email address.' }] },
    },
  },
  ...fieldErrors({ email: 'Invalid email address.', password: 'Passwords do not match.' }),
});
export const ResetPassword = story('login-reset-password.ftl');
export const UpdatePassword = story('login-update-password.ftl');
export const VerifyEmail = story('login-verify-email.ftl');
/** A29: a Google sign-in whose email already belongs to a password account; password is the default way. */
export const LinkAccountConfirm = story('login-idp-link-confirm.ftl', { idpAlias: 'google' });
/** A29: the account has no password (it was created another way), so the email is the only way. */
export const LinkAccountEmailOnly = story('login-idp-link-confirm.ftl', {
  idpAlias: 'google',
  scLink: { email: 'bao.nguyen.dangit@gmail.com', hasPassword: false, emailAvailable: true },
});
/** A29: the typed password was wrong. */
export const LinkAccountWrongPassword = story('login-idp-link-confirm.ftl', {
  idpAlias: 'google',
  message: { type: 'error', summary: 'Invalid email or password.' },
});
/** A29: the verification email has been sent; resend waits a minute. */
export const LinkAccountEmailSent = story('login-idp-link-email.ftl', { idpAlias: 'google' });
/** A29: the minute has passed, so resend is available. */
export const LinkAccountEmailSentCanResend = story('login-idp-link-email.ftl', {
  idpAlias: 'google',
  scLink: { email: 'bao.nguyen.dangit@gmail.com', resendIn: 0 },
});
export const IdpReviewProfile = story('idp-review-user-profile.ftl');
export const Otp = story('login-otp.ftl');
export const ConfigTotp = story('login-config-totp.ftl');
export const RecoveryCodesConfig = story('login-recovery-authn-code-config.ftl');
export const RecoveryCodesInput = story('login-recovery-authn-code-input.ftl');
export const ErrorPage = story('error.ftl', {
  message: { type: 'error', summary: 'Something went wrong. Please try again.' },
});
export const LogoutConfirm = story('logout-confirm.ftl');
export const PageExpired = story('login-page-expired.ftl');
export const SelectAuthenticator = story('select-authenticator.ftl');
