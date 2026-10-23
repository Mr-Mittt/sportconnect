import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { apiClient } from '@/app/apiClient';
import { getApiError, getErrorMessage } from '@/shared/lib/apiError';
import { useCountdown } from '@/shared/lib/useCountdown';
import type { ApiResponse } from '@/shared/types/api';

/** Mirrors the backend's `ConfirmationCodeResponse` (U26 answers the same shape for the new-address code). */
interface NewEmailCodeResponse {
  resendAfterSeconds: number;
  expiresInSeconds: number;
}

/** Everything the change-email dialog's Verify step needs. */
export interface NewEmailCodeSender {
  send: (newEmail: string) => void;
  isSending: boolean;
  /** A code was mailed to the address last sent: show the code input. */
  hasSent: boolean;
  /** Seconds until Verify may be pressed again; `0` when it may. Runs on even when the address is edited. */
  resendSecondsLeft: number;
  expiresInSeconds: number;
  /** The failed send's server code (`EMAIL_ALREADY_REGISTERED`, `NEW_EMAIL_SAME_AS_CURRENT`, ...); `null` for the quiet too-soon case. */
  errorCode: string | null;
  errorMessage: string | null;
  /** Hides the code step and drops a stale error (the address was edited, or a duplicate was reported); the countdown keeps running. */
  closeCodeStep: () => void;
  reset: () => void;
}

/**
 * ACCOUNT-7: asks the backend to mail a 6-digit code to the address the user wants to move to
 * (`POST /api/users/me/email-change-code`, U26). The lock is per user, not per address, so the
 * countdown outlives an edit of the address: `closeCodeStep` hides the code input but leaves the
 * wait running, and a `VERIFICATION_RESEND_TOO_SOON` restarts it from `errorParams.seconds` without an
 * error line (no code went to *this* address, so the code step stays closed). Any other failed send
 * starts no countdown: a 503 mailed nothing, and the daily limit (`NEW_EMAIL_CODE_LIMIT_REACHED`, hours
 * away) is told in words rather than as a clock.
 */
export function useEmailChangeCode(): NewEmailCodeSender {
  const [hasSent, setHasSent] = useState(false);
  const [expiresInSeconds, setExpiresInSeconds] = useState(900);
  const resend = useCountdown();

  const mutation = useMutation({
    meta: { errorDisplay: 'inline' },
    mutationFn: async (newEmail: string) => {
      const response = await apiClient.post<ApiResponse<NewEmailCodeResponse>>('/users/me/email-change-code', {
        newEmail: newEmail.trim(),
      });
      return response.data.data;
    },
    onSuccess: (data) => {
      setHasSent(true);
      resend.start(data.resendAfterSeconds);
      setExpiresInSeconds(data.expiresInSeconds);
    },
    onError: (error) => {
      setHasSent(false);
      const apiError = getApiError(error);
      const seconds = apiError.params?.seconds;
      if (apiError.code === 'VERIFICATION_RESEND_TOO_SOON' && typeof seconds === 'number') {
        resend.start(seconds);
      }
    },
  });

  const error = mutation.error !== null ? getApiError(mutation.error) : null;
  const isTooSoon = error?.code === 'VERIFICATION_RESEND_TOO_SOON';

  return {
    send: (newEmail) => mutation.mutate(newEmail),
    isSending: mutation.isPending,
    hasSent,
    resendSecondsLeft: resend.secondsLeft,
    expiresInSeconds,
    errorCode: error && !isTooSoon ? (error.code ?? null) : null,
    errorMessage: mutation.error && !isTooSoon ? getErrorMessage(mutation.error) : null,
    closeCodeStep: () => {
      setHasSent(false);
      mutation.reset();
    },
    reset: () => {
      mutation.reset();
      setHasSent(false);
      resend.stop();
    },
  };
}
