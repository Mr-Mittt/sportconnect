import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthShell } from './components/AuthShell';
import { ResetLinkProblem } from './components/ResetLinkProblem';
import { ResetPasswordForm } from './components/ResetPasswordForm';
import { useResetPassword, isResetLinkErrorCode } from './useResetPassword';
import { useResetTokenCheck } from './useResetTokenCheck';

/**
 * Standalone public route (AUTH-9) reached from the emailed link (`/reset-password?token=…`).
 * On load it asks the server whether the link is still usable (backend A21): a missing token or a
 * 404 `RESET_TOKEN_INVALID` (unknown, used or expired — one generic answer) goes straight to the
 * "request a new link" state, so the user never types a password into a dead link. The submit
 * still handles `RESET_TOKEN_*` too, because a token can change between load and submit. On
 * success the user goes to /login with a notice — the reset does not sign them in (the backend
 * revokes their refresh tokens).
 */
export function ResetPasswordPage() {
  const { t } = useTranslation('resetPassword');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { isChecking, isLinkInvalid } = useResetTokenCheck(token);
  const { resetPassword, isPending, errorMessage, errorCode } = useResetPassword({
    onSuccess: () => navigate('/login', { replace: true, state: { passwordReset: true } }),
  });

  const linkProblemCode =
    !token || isLinkInvalid ? 'RESET_TOKEN_INVALID' : isResetLinkErrorCode(errorCode) ? errorCode : null;

  return (
    <AuthShell tagline={t('tagline')}>
      {isChecking ? (
        <p role="status" className="text-2sm text-text-secondary">
          {t('checking')}
        </p>
      ) : linkProblemCode ? (
        <ResetLinkProblem errorCode={linkProblemCode} />
      ) : (
        <ResetPasswordForm
          onSubmit={(newPassword) => resetPassword({ token: token ?? '', newPassword })}
          isPending={isPending}
          errorMessage={errorMessage}
        />
      )}
    </AuthShell>
  );
}
