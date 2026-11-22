import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import type { ImportRequest } from './types';
import { useImportApply } from './useImportApply';
import { useImportPreview } from './useImportPreview';

const request: ImportRequest = {
  groupId: 46,
  locationId: 7,
  aliases: { 'Anh_VL': 'u-1' },
  sessions: [{ title: 'T', localDate: '2026-10-29', startTime: '07:00', endTime: '09:00', games: [{ winners: ['A'], losers: ['B'] }] }],
};

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function failure(status: number, errorCode: string, errorParams?: Record<string, unknown>) {
  return { isAxiosError: true, response: { status, data: { success: false, message: 'English server text', errorCode, errorParams } } };
}

describe('useImportPreview and useImportApply (CLIENT-ADMIN-IMPORT-1)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('preview POSTs the request to /sessions/import/preview and returns the preview', async () => {
    const preview = { hostUserId: 'h', sessions: [], unresolved: [], canApply: true, members: [] };
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { success: true, message: '', data: preview, timestamp: '' } });
    const { result } = renderHook(() => useImportPreview(), { wrapper: wrapper() });

    result.current.preview(request);

    await waitFor(() => expect(result.current.data).toEqual(preview));
    expect(post).toHaveBeenCalledWith('/sessions/import/preview', request);
  });

  it('apply POSTs the request to /sessions/import and returns the per-session result', async () => {
    const applied = { created: 1, skipped: 0, failed: 0, results: [{ title: 'T', localDate: '2026-10-29', status: 'CREATED', sessionId: 5 }] };
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { success: true, message: '', data: applied, timestamp: '' } });
    const { result } = renderHook(() => useImportApply(), { wrapper: wrapper() });

    result.current.apply(request);

    await waitFor(() => expect(result.current.data).toEqual(applied));
    expect(post).toHaveBeenCalledWith('/sessions/import', request);
  });

  it('a refused preview has its own English message, never the server text', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue(failure(404, 'GROUP_NOT_FOUND'));
    const { result } = renderHook(() => useImportPreview(), { wrapper: wrapper() });
    result.current.preview(request);
    await waitFor(() => expect(result.current.errorMessage).toBe('No active group has that id.'));
  });

  it('a refused apply has its own message too, and reset clears it', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue(failure(409, 'SESSION_IMPORT_UNRESOLVED_NAMES', { names: ['Ánh'] }));
    const { result } = renderHook(() => useImportApply(), { wrapper: wrapper() });
    result.current.apply(request);
    await waitFor(() => expect(result.current.errorMessage).toBe('These names still need a member: Ánh.'));
    result.current.reset();
    await waitFor(() => expect(result.current.errorMessage).toBeNull());
  });
});
