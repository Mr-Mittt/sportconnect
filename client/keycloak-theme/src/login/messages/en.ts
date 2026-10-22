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
  // AUTH-16: the register page's optional zone block (country, region, detected location).
  geoCountry: 'Country',
  geoRegion: 'Region',
  geoSelectCountry: 'Select a country',
  geoSelectRegion: 'Select a region',
  geoNoRegions: 'No regions available for this country',
  geoRegionsLoadError: 'Regions could not be loaded right now',
  geoReferenceLoadError: 'Countries could not be loaded right now',
  geoUseMyLocation: 'Use my current location',
  geoLocating: 'Locating…',
  geoHintDenied: 'Location access was denied. You can still pick these manually.',
  geoHintUnavailable: 'Location is not available right now. You can still pick these manually.',
  geoHintNoMatch: 'We could not tell where you are from that location. Please pick your country and region below.',
  geoHintTimeout: 'Location took too long to respond. You can still pick these manually.',
  geoOptionalNote:
    'Your zone is optional. Set it to discover the sport community in your area; you can change it any time in Account Settings.',
  // A29: linking a social sign-in to an existing account (pages login-idp-link-confirm / login-idp-link-email).
  linkAccountTitle: 'This email already has an account',
  linkAccountIntro:
    'An account with {0} already exists. To add your {1} sign-in to it, first confirm the account is yours.',
  linkUsePassword: 'Use my password',
  linkVerifyByEmail: 'Verify by email',
  linkVerifyByEmailHint: 'We will send a verification link to {0}.',
  linkEmailSentTitle: 'Check your email',
  linkEmailSentBody: 'We sent a verification email to {0}. Open it and click the link to continue.',
  linkResend: 'Resend email',
  linkResendIn: 'Resend email in {0}s',
  linkBackToLogin: 'Back to log in',
} as const;

export type ThemeMessageKey = keyof typeof en;
export default en as Record<ThemeMessageKey, string>;
