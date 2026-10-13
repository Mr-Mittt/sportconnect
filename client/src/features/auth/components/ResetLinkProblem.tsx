import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/shared/ui/button';

interface ResetLinkProblemProps {
  /** A `RESET_TOKEN_*` code; a missing `token` param is shown as `RESET_TOKEN_INVALID`. */
  errorCode: string;
}

/** Inline state for a reset link that cannot be used (invalid, already used, expired, or missing). */
export function ResetLinkProblem({ errorCode }: ResetLinkProblemProps) {
  const { t } = useTranslation('resetPassword');
  const { t: tErrors } = useTranslation('errors');

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold tracking-tight text-text-primary">{t('problem.heading')}</h1>
      <p role="alert" className="mb-6 text-2sm text-text-secondary">
        {tErrors(`codes.${errorCode}`)}
      </p>
      <Button variant="primary" className="w-full" asChild>
        <Link to="/forgot-password">{t('problem.requestNew')}</Link>
      </Button>
      <p className="mt-6 text-center text-2sm">
        <Link to="/login" className="text-text-accent hover:underline">
          {t('problem.backToLogin')}
        </Link>
      </p>
    </div>
  );
}
