import { useMutation, useQueryClient } from '@tanstack/react-query';
import i18next from 'i18next';
import { useState } from 'react';
import { apiClient } from '@/app/apiClient';
import { getApiError, getErrorMessage } from '@/shared/lib/apiError';
import { useCountdown } from '@/shared/lib/useCountdown';
import type { ApiResponse } from '@/shared/types/api';
import { profileKeys } from './queryKeys';

/** Mirrors the backend's `EmailVerificationResponse` (auth A33). */
interface EmailVerificationResponse {
  alreadyVerified: boolean;
  resendAfterSeconds: number;
}

/** What the account-settings email row needs to start a verification mail. */
export interface EmailVerificationSender {
  send: () => void;
  isSending: boolean;
  /** A verification mail was requested in this session: the row says to open the link in it. */
  hasSent: boolean;
  /** Seconds until the link may be asked for again; `0` when it may. */
  resendSecondsLeft: number;
  /** Localized inline line for a failed request; `null` for the quiet too-soon case. */
  errorMessage: string | null;
}

/**
 * ACCOUNT-7: starts the verification mail for the caller's own address (`POST
 * /api/users/me/email-verification`, auth A33; no body). `alreadyVerified: true` means nothing was
 * sent and the profile is read again so the row flips to Verified. `VERIFICATION_RESEND_TOO_SOON`
 * restarts the countdown from `errorParams.seconds` without an error line. The row has its own
 * strings (`accountSettings:verifyEmail.error.*`) because the shared copy for these codes talks about
 * a *code*; a 503 uses the shared "service not available, try again later" line.
 */
export function useEmailVerification(): EmailVerificationSender {
  const queryClient = useQueryClient();
  const [hasSent, setHasSent] = useState(false);
  const resend = useCountdown();

  const mutation = useMutation({
    meta: { errorDisplay: 'inline' },
    mutationFn: async () => {
      const response = await apiClient.post<ApiResponse<EmailVerificationResponse>>('/users/me/email-verification');
      return response.data.data;
    },
    onSuccess: async (data) => {
      if (data.alreadyVerified) {
        await queryClient.invalidateQueries({ queryKey: profileKeys.all });
        return;
      }
      setHasSent(true);
      resend.start(data.resendAfterSeconds);
    },
    onError: (error) => {
      const apiError = getApiError(error);
      const seconds = apiError.params?.seconds;
      if (apiError.code === 'VERIFICATION_RESEND_TOO_SOON' && typeof seconds === 'number') {
        setHasSent(true);
        resend.start(seconds);
      }
    },
  });

  let errorMessage: string | null = null;
  if (mutation.error) {
    const apiError = getApiError(mutation.error);
    if (apiError.code === 'VERIFICATION_RESEND_TOO_SOON') errorMessage = null;
    else if (apiError.code === 'VERIFICATION_EMAIL_UNAVAILABLE') errorMessage = i18next.t('accountSettings:verifyEmail.error.unavailable');
    else if (apiError.code === 'SERVICE_UNAVAILABLE') errorMessage = getErrorMessage(mutation.error);
    else errorMessage = i18next.t('accountSettings:verifyEmail.error.generic');
  }

  return {
    send: () => mutation.mutate(),
    isSending: mutation.isPending,
    hasSent,
    resendSecondsLeft: resend.secondsLeft,
    errorMessage,
  };
}
