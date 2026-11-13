import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { resultSchemaQueryKey } from '@/shared/hooks/useResultSchema';
import { adminKeys } from './queryKeys';
import { useReplaceResultSchema } from './useReplaceResultSchema';

describe('useReplaceResultSchema (SPORT-18)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('PUTs the whole document and refreshes both the admin and the member read of that sport', async () => {
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({ data: { success: true, message: '', data: null, timestamp: '' } });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useReplaceResultSchema(7), { wrapper });

    result.current.replaceSchema({ version: 1, maxRecords: 20 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(put).toHaveBeenCalledWith('/sports/7/result-schema', { version: 1, maxRecords: 20 });
    const keys = invalidate.mock.calls.map((call) => JSON.stringify((call[0] as { queryKey: unknown }).queryKey));
    expect(keys).toContain(JSON.stringify(adminKeys.resultSchema(7)));
    expect(keys).toContain(JSON.stringify(resultSchemaQueryKey(7)));
  });

  it('shows the server message verbatim when the save is refused', async () => {
    vi.spyOn(apiClient, 'put').mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { success: false, message: 'maxRecords must be an integer from 1 to 500' } },
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useReplaceResultSchema(7), { wrapper });
    result.current.replaceSchema({ maxRecords: 0 });
    await waitFor(() => expect(result.current.errorMessage).toBe('maxRecords must be an integer from 1 to 500'));
  });
});
