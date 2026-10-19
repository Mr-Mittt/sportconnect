import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { apiClient } from '@/app/apiClient';
import { getApiError, getErrorMessage } from '@/shared/lib/apiError';
import { useCountdown } from '@/shared/lib/useCountdown';
import type { ApiResponse } from '@/shared/types/api';

export type ConfirmationPurpose = 'DEACTIVATE' | 'CHANGE_PASSWORD';

/** Mirrors the backend's `ConfirmationCodeResponse`. */
interface ConfirmationCodeResponse {
  resendAfterSeconds: number;
  expiresInSeconds: number;
}

/** Everything the dialogs' "verify by email" method needs (see `ConfirmationProofFields`). */
export interface CodeSender {
  send: () => void;
  isSending: boolean;
  /** A code was sent (or one is already waiting, per `VERIFICATION_RESEND_TOO_SOON`): show the code input. */
  hasSent: boolean;
  /** Seconds until Resend is allowed again; `0` when it is. */
  resendSecondsLeft: number;
  expiresInSeconds: number;
  /** Localized line for a failed send; `null` for the quiet "too soon" case, which only restarts the countdown. */
  errorMessage: string | null;
}

/**
 * ACCOUNT-6: asks the backend to email a 6-digit code (`POST /api/users/me/confirmation-code`,
 * U24). The code is bound to `purpose`, valid `expiresInSeconds` (900) and can be re-sent after
 * `resendAfterSeconds` (60); the response's numbers drive the countdown, they are not hardcoded.
 * A `VERIFICATION_RESEND_TOO_SOON` (another tab, or a reload) restarts the countdown from
 * `errorParams.seconds` and counts as sent, because a code is already waiting. `reset` clears it all
 * when the dialog closes.
 */
export function useConfirmationCode(purpose: ConfirmationPurpose): CodeSender & { reset: () => void } {
  const [hasSent, setHasSent] = useState(false);
  const [expiresInSeconds, setExpiresInSeconds] = useState(900);
  const resend = useCountdown();

  const mutation = useMutation({
    meta: { errorDisplay: 'inline' },
    mutationFn: async () => {
      const response = await apiClient.post<ApiResponse<ConfirmationCodeResponse>>('/users/me/confirmation-code', {
        purpose,
      });
      return response.data.data;
    },
    onSuccess: (data) => {
      setHasSent(true);
      resend.start(data.resendAfterSeconds);
      setExpiresInSeconds(data.expiresInSeconds);
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

  const isTooSoon = mutation.error !== null && getApiError(mutation.error).code === 'VERIFICATION_RESEND_TOO_SOON';

  return {
    send: () => mutation.mutate(),
    isSending: mutation.isPending,
    hasSent,
    resendSecondsLeft: resend.secondsLeft,
    expiresInSeconds,
    errorMessage: mutation.error && !isTooSoon ? getErrorMessage(mutation.error) : null,
    reset: () => {
      mutation.reset();
      setHasSent(false);
      resend.stop();
    },
  };
}
