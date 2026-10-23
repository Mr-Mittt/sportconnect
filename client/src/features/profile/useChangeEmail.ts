import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/app/authStore';
import { apiClient } from '@/app/apiClient';
import { usePasswordLockStore } from '@/app/passwordLockStore';
import { getApiError, getErrorMessage } from '@/shared/lib/apiError';
import type { ApiResponse } from '@/shared/types/api';
import { proofBody, type ConfirmationProof } from './confirmationProof';
import { profileKeys } from './queryKeys';
import type { UserResponse } from './types';

interface ChangeEmailPayload {
  newEmail: string;
  /** The 6 digits mailed to `newEmail`. */
  newEmailCode: string;
  /** The caller's proof: the current password, or the code mailed to the current address. */
  proof: ConfirmationProof;
}

async function changeEmail({ newEmail, newEmailCode, proof }: ChangeEmailPayload): Promise<void> {
  await apiClient.put('/users/me/email', { newEmail: newEmail.trim(), newEmailCode, ...proofBody(proof) });
}

/** Which of the two codes a `VERIFICATION_CODE_*` refusal is about (the backend says so in `errorParams.purpose`). */
export type EmailCodeSubject = 'CHANGE_EMAIL' | 'NEW_EMAIL';

/**
 * ACCOUNT-7: wraps `PUT /api/users/me/email` (U26). Two codes and one password go in, so a
 * `VERIFICATION_CODE_*` answer carries `codeSubject` (`CHANGE_EMAIL`: the code mailed to the current
 * address, `NEW_EMAIL`: the one mailed to the new address) and the dialog puts the line on that input.
 * On success the profile is read again (the account is now on the new address, verified, unlinked from
 * Google and without a Google avatar) and the new email, username and avatar are copied into the
 * login snapshot the top bar reads; only then does `onSuccess` run. `passwordLockSeconds` is the
 * shared wrong-password lock, as in change password.
 */
export function useChangeEmail(options?: { onSuccess?: () => void }): {
  changeEmail: (payload: ChangeEmailPayload) => void;
  isPending: boolean;
  errorMessage: string | null;
  errorCode: string | null;
  codeSubject: EmailCodeSubject | null;
  passwordLockSeconds: number;
  reset: () => void;
} {
  const queryClient = useQueryClient();
  const passwordLockSeconds = usePasswordLockStore((state) => state.secondsLeft);
  const mutation = useMutation({
    meta: { errorDisplay: 'inline' },
    mutationFn: changeEmail,
    onSuccess: async () => {
      const userId = useAuthStore.getState().user?.id;
      try {
        const response = await apiClient.get<ApiResponse<UserResponse>>('/users/me');
        const profile = response.data.data;
        if (userId !== undefined) queryClient.setQueryData(profileKeys.myProfile(userId), profile);
        useAuthStore.getState().patchUser({
          email: profile.email,
          ...(profile.username !== null ? { username: profile.username } : {}),
          avatarUrl: profile.avatarUrl,
        });
      } catch {
        // The change itself went through; the profile query catches up on its next refetch.
        await queryClient.invalidateQueries({ queryKey: profileKeys.all });
      }
      options?.onSuccess?.();
    },
    onError: (error) => {
      const apiError = getApiError(error);
      const seconds = apiError.params?.seconds;
      if (apiError.code === 'PASSWORD_ATTEMPTS_EXCEEDED' && typeof seconds === 'number') {
        usePasswordLockStore.getState().lock(seconds);
      }
    },
  });

  const apiError = mutation.error ? getApiError(mutation.error) : null;
  const purpose = apiError?.params?.purpose;
  return {
    changeEmail: mutation.mutate,
    isPending: mutation.isPending,
    errorMessage: mutation.error ? getErrorMessage(mutation.error) : null,
    errorCode: apiError?.code ?? null,
    codeSubject: purpose === 'CHANGE_EMAIL' || purpose === 'NEW_EMAIL' ? purpose : null,
    passwordLockSeconds,
    reset: () => mutation.reset(),
  };
}
