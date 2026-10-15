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
export const Register = story('register.ftl');
export const RegisterWithErrors = story('register.ftl', {
  profile: {
    attributesByName: {
      email: { value: 'not-an-email', validationErrors: [{ message: 'Invalid email address.' }] },
    },
  },
  ...fieldErrors({ email: 'Invalid email address.', password: 'Passwords do not match.' }),
});
export const ResetPassword = story('login-reset-password.ftl');
export const UpdatePassword = story('login-update-password.ftl');
export const VerifyEmail = story('login-verify-email.ftl');
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
