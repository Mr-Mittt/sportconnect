import enLogin from '@/locales/en/login.json';

/**
 * Theme-defined English strings. Only what Keycloak's stock English set does not already say the
 * way the client does: everything the client's `login.json` owns is imported from there, so there
 * is no second copy of it (A24).
 */
const en = {
  sportconnectTagline: enLogin.tagline,
  loginAccountTitle: enLogin.heading,
  loginAccountSubtitle: enLogin.subheading,
  continueWith: 'Continue with {0}',
  or: enLogin.form.or,
  noAccount: enLogin.form.newToSportHub,
  doRegister: enLogin.form.createAccount,
  doForgotPassword: enLogin.form.forgotPassword,
  doLogIn: enLogin.form.submit,
  doLoggingIn: enLogin.form.submitting,
  email: enLogin.form.email.label,
  password: enLogin.form.password.label,
  showPassword: enLogin.form.password.showAction,
  hidePassword: enLogin.form.password.hideAction,
  loginTitle: 'Log in to SportHub',
  registerTitle: 'Create your account',
  registerSubtitle: 'Join SportHub and find your people.',
  emailForgotTitle: 'Forgot your password?',
  backToLogin: '&laquo; Back to log in',
  firstName: 'First name',
  lastName: 'Last name',
  phoneNumber: 'Phone number',
  registerSubmit: 'Create account',
  haveAccount: 'Already have an account?',
  requiredMark: 'required',
} as const;

export type ThemeMessageKey = keyof typeof en;
export default en as Record<ThemeMessageKey, string>;
