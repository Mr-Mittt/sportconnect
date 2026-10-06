import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionErrorDialogStore } from '@/app/sessionErrorDialogStore';
import * as errorToast from '@/shared/lib/errorToast';
import { sessionKeys } from './queryKeys';
import {
  isSessionDialogError,
  isSessionForbiddenDialogError,
  reportSessionDialogError,
  reportSessionMutationError,
  useSessionErrorDialog,
  useSessionErrorGuard,
} from './sessionErrors';

function coded(status: number, errorCode?: string): AxiosError {
  const error = new AxiosError('failed', 'ERR_BAD_REQUEST');
  error.response = { status, data: { success: false, message: 'prose', errorCode } } as AxiosResponse;
  return error;
}

const STAY_OPEN = [
  'SESSION_NOT_FOUND',
  'SESSION_JOIN_REQUEST_NOT_FOUND',
  'SESSION_CANCELLED',
  'SESSION_NOT_CANCELLABLE',
  'SESSION_NOT_PREPARING',
  'SESSION_NOT_PARTICIPANT',
];
const CLOSE = [
  'SESSION_FORBIDDEN',
  'SESSION_GROUP_MEMBER_REQUIRED',
  'SESSION_GROUP_ADMIN_REQUIRED',
  'SESSION_CREATOR_REQUIRED',
];

beforeEach(() => {
  vi.restoreAllMocks();
  useSessionErrorDialogStore.setState({ error: null, dismissals: 0, lastDismissedForbidden: false });
});

function wrapperFor(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('session error classification', () => {
  it.each([...STAY_OPEN, ...CLOSE])('%s is a dialog code', (code) => {
    expect(isSessionDialogError(coded(409, code))).toBe(true);
  });

  it.each(CLOSE)('%s closes the modal on dismissal', (code) => {
    expect(isSessionForbiddenDialogError(coded(403, code))).toBe(true);
  });

  it.each(STAY_OPEN)('%s leaves the modal open', (code) => {
    expect(isSessionForbiddenDialogError(coded(409, code))).toBe(false);
  });

  it.each([
    ['SESSION_CREATOR_CANNOT_LEAVE', 400],
    ['SESSION_SPORT_REQUIRED', 400],
    ['POST_NOT_FOUND', 404],
    [undefined, 500],
  ])('%s is not a dialog code', (code, status) => {
    expect(isSessionDialogError(coded(status, code))).toBe(false);
  });
});

describe('reportSessionMutationError / reportSessionDialogError', () => {
  it('opens the dialog with the raw error and shows no toast for a dialog code', () => {
    const toast = vi.spyOn(errorToast, 'showErrorToast').mockImplementation(() => {});
    const error = coded(409, 'SESSION_CANCELLED');
    reportSessionMutationError(error);
    expect(useSessionErrorDialogStore.getState().error).toBe(error);
    expect(toast).not.toHaveBeenCalled();
  });

  it('keeps the toast for anything else', () => {
    const toast = vi.spyOn(errorToast, 'showErrorToast').mockImplementation(() => {});
    reportSessionMutationError(coded(500));
    expect(toast).toHaveBeenCalledTimes(1);
    expect(useSessionErrorDialogStore.getState().error).toBeNull();
  });

  it('reportSessionDialogError only reports whether it handled the error (inline hooks fall back themselves)', () => {
    expect(reportSessionDialogError(coded(400, 'SESSION_SPORT_REQUIRED'))).toBe(false);
    expect(useSessionErrorDialogStore.getState().error).toBeNull();
    expect(reportSessionDialogError(coded(403, 'SESSION_GROUP_ADMIN_REQUIRED'))).toBe(true);
  });
});

describe('useSessionErrorDialog', () => {
  it('dismissing clears the error and refetches session queries, skipping an errored one', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(sessionKeys.detail(1), { id: 1 });
    await queryClient
      .fetchQuery({ queryKey: sessionKeys.detail(2), queryFn: () => Promise.reject(new Error('x')), retry: false })
      .catch(() => {});
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    useSessionErrorDialogStore.setState({ error: coded(403, 'SESSION_FORBIDDEN') });

    const { result } = renderHook(() => useSessionErrorDialog(), { wrapper: wrapperFor(queryClient) });
    act(() => result.current.onDismiss());

    const state = useSessionErrorDialogStore.getState();
    expect(state.error).toBeNull();
    expect(state.lastDismissedForbidden).toBe(true);
    const arg = invalidate.mock.calls[0][0]!;
    expect(arg.queryKey).toEqual(sessionKeys.all);
    const predicate = arg.predicate!;
    expect(predicate(queryClient.getQueryCache().find({ queryKey: sessionKeys.detail(1) })!)).toBe(true);
    expect(predicate(queryClient.getQueryCache().find({ queryKey: sessionKeys.detail(2) })!)).toBe(false);
  });
});

describe('useSessionErrorGuard', () => {
  function dismiss(forbidden: boolean) {
    act(() => useSessionErrorDialogStore.getState().dismiss(forbidden));
  }

  it('closes the open modal when the dismissed dialog was a 403', () => {
    const close = vi.fn();
    renderHook(() => useSessionErrorGuard(5, close));
    dismiss(true);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('leaves the modal open when the dismissed dialog was a 409 or 404', () => {
    const close = vi.fn();
    renderHook(() => useSessionErrorGuard(5, close));
    dismiss(false);
    expect(close).not.toHaveBeenCalled();
  });

  it('does nothing in an instance with no session open', () => {
    const close = vi.fn();
    renderHook(() => useSessionErrorGuard(null, close));
    dismiss(true);
    expect(close).not.toHaveBeenCalled();
  });
});
