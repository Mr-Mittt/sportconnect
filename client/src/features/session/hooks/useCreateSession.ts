import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { sessionKeys } from '../queryKeys';
import type { CreateSessionPayload, Session } from '../types';
import type { ApiResponse } from '@/shared/types/api';

/** Wraps `POST /api/sessions`. Invalidates every session query — the created session could land in a group list, `mine`, or both the rail and the Matches page's aggregation. */
export function useCreateSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateSessionPayload) => {
      const response = await apiClient.post<ApiResponse<Session>>('/sessions', payload);
      return response.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}
