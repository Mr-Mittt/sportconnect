import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { AuthShell } from './components/AuthShell';
import { ForgotPasswordForm } from './components/ForgotPasswordForm';
import { useForgotPassword } from './useForgotPassword';

/**
 * Standalone public route (AUTH-9), outside AppShell like Login/Register. LoginForm's "Forgot
 * password?" link passes the typed email in router state so the field is prefilled.
 */
export function ForgotPasswordPage() {
  const { t } = useTranslation('forgotPassword');
  const location = useLocation();
  const initialEmail = (location.state as { email?: string } | null)?.email ?? '';
  const { requestReset, isPending, isSuccess, errorMessage } = useForgotPassword();

  return (
    <AuthShell tagline={t('tagline')}>
      <ForgotPasswordForm
        onSubmit={requestReset}
        isPending={isPending}
        isSent={isSuccess}
        errorMessage={errorMessage}
        initialEmail={initialEmail}
      />
    </AuthShell>
  );
}
