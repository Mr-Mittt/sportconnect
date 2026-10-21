import { IconAlertTriangle, IconCircleCheck } from '@tabler/icons-react';
import type { EmailVerificationSender } from '@/features/profile/useEmailVerification';
import { formatCountdown } from '@/shared/lib/useCountdown';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import { Button } from '@/shared/ui/button';

interface AccountEmailSectionProps {
  /** The account's address, or `null` for a phone-only account (the button then reads "Add email" and no status shows). */
  email: string | null;
  isVerified: boolean;
  /** Starts the verification mail (the "Get verification now" link). */
  verification: EmailVerificationSender;
  /** Opens the change-email dialog (owned by `AppShell`). */
  onChangeEmail: () => void;
  /** `"namespace:key.path"` override for the copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
}

/**
 * ACCOUNT-7: the email row of Account Settings, above Change password. Left: the address and its
 * Change email button. Right: the status, never by colour alone: Verified (check icon and text), or
 * Not verified yet (warning icon, text and a "Get verification now" link that becomes "Re-send in
 * m:ss" for the countdown of the last mail, then the link again). A phone-only account has no address and no status.
 */
export function AccountEmailSection({
  email,
  isVerified,
  verification,
  onChangeEmail,
  i18nOverridePrefix,
}: AccountEmailSectionProps) {
  const t = useOverridableText('accountSettings', i18nOverridePrefix);
  const canSend = !verification.isSending && verification.resendSecondsLeft === 0;

  return (
    <section className="mt-1 border-t border-border pt-3.5">
      <h4 className="mb-2 text-2sm font-semibold text-text-secondary">{t('section.email')}</h4>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-2 text-2sm break-all text-text-primary">{email ?? t('email.none')}</p>
          <Button type="button" variant="outline" size="sm" onClick={onChangeEmail}>
            {email === null ? t('email.add') : t('email.change')}
          </Button>
        </div>

        {email !== null && isVerified && (
          <p className="flex items-center gap-1 text-2sm text-text-success">
            <IconCircleCheck size={16} aria-hidden="true" />
            {t('email.verified')}
          </p>
        )}

        {email !== null && !isVerified && (
          <div className="max-w-[16rem]">
            <p className="flex items-center gap-1 text-2sm text-amber-800">
              <IconAlertTriangle size={16} aria-hidden="true" />
              {t('email.notVerified')}
            </p>
            {canSend ? (
              <button
                type="button"
                onClick={verification.send}
                className="mt-1 cursor-pointer text-2sm text-text-accent underline"
              >
                {t('email.getVerification')}
              </button>
            ) : (
              <p className="mt-1 text-2sm text-text-secondary">
                {verification.isSending
                  ? t('email.sending')
                  : t('email.resendIn', { time: formatCountdown(verification.resendSecondsLeft) })}
              </p>
            )}
            {verification.hasSent && <p className="mt-1 text-2xs text-text-secondary">{t('email.sentHint')}</p>}
            {verification.errorMessage !== null && (
              <p role="alert" className="mt-1 text-2xs text-text-danger">
                {verification.errorMessage}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
