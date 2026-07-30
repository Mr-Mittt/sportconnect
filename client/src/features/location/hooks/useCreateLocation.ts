import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { locationKeys } from '../queryKeys';
import type { ApiResponse } from '@/shared/types/api';
import type { CreateLocationPayload, Location } from '../types';

/**
 * Wraps `POST /api/locations` — any authenticated user may add a venue (LOC-1: crowdsourced,
 * duplicates are an accepted tradeoff). Invalidates every cached search so the new `Location`
 * shows up immediately if the picker is reopened against the same sport/keyword.
 */
export function useCreateLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateLocationPayload) => {
      const response = await apiClient.post<ApiResponse<Location>>('/locations', payload);
      return response.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: locationKeys.all }),
  });
}
