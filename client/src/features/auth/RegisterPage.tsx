import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthShell } from './components/AuthShell';
import { RegisterForm } from './components/RegisterForm';
import { useRegister } from './useRegister';

/**
 * Standalone route (not wrapped in AppShell). Registration also logs the
 * user in, so a successful submit redirects straight into the app — back to
 * wherever ProtectedRoute (AUTH-4) redirected the user from, if any,
 * otherwise Home Feed. Same redirect-back behavior as LoginPage.
 */
export function RegisterPage() {
  const { t } = useTranslation('register');
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const { register, isPending, errorMessage, errorCode, errorFields } = useRegister({
    onSuccess: () => navigate(from, { replace: true }),
  });

  return (
    // CLIENT-REF-2: translated tagline — see AuthShell's doc comment for why this is a prop
    // rather than AuthShell translating its own default (which LoginPage also renders).
    <AuthShell tagline={t('tagline')}>
      <RegisterForm
        onSubmit={register}
        isPending={isPending}
        errorMessage={errorMessage}
        errorCode={errorCode}
        errorFields={errorFields}
      />
    </AuthShell>
  );
}
