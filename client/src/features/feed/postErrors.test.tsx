import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePostErrorDialogStore } from '@/app/postErrorDialogStore';
import * as errorToast from '@/shared/lib/errorToast';
import { feedKeys } from './queryKeys';
import { isPostDialogError, reportPostMutationError, usePostErrorGuard } from './postErrors';

function coded(status: number, errorCode?: string): AxiosError {
  const error = new AxiosError('failed', 'ERR_BAD_REQUEST');
  error.response = { status, data: { success: false, message: 'prose', errorCode } } as AxiosResponse;
  return error;
}

beforeEach(() => {
  vi.restoreAllMocks();
  usePostErrorDialogStore.setState({ error: null, dismissals: 0 });
});

describe('reportPostMutationError', () => {
  it.each(['POST_NOT_FOUND', 'POST_FORBIDDEN', 'POST_DELETE_FORBIDDEN'])(
    '%s opens the pop-up and shows no toast',
    (code) => {
      const toast = vi.spyOn(errorToast, 'showErrorToast').mockImplementation(() => {});
      const error = coded(403, code);
      reportPostMutationError(error);
      expect(usePostErrorDialogStore.getState().error).toBe(error);
      expect(toast).not.toHaveBeenCalled();
    },
  );

  it.each([
    'POST_ALREADY_LIKED',
    'POST_NOT_LIKED',
    'COMMENT_ALREADY_LIKED',
    'COMMENT_NOT_LIKED',
    'COMMENT_NOT_FOUND',
    'COMMENT_PARENT_NOT_FOUND',
  ])('%s says nothing (the refetch shows the truth)', (code) => {
    const toast = vi.spyOn(errorToast, 'showErrorToast').mockImplementation(() => {});
    reportPostMutationError(coded(409, code));
    expect(toast).not.toHaveBeenCalled();
    expect(usePostErrorDialogStore.getState().error).toBeNull();
  });

  it.each([
    ['COMMENT_DELETE_FORBIDDEN', 403],
    ['SOMETHING_NEW', 500],
    [undefined, 500],
  ])('%s keeps the toast', (code, status) => {
    const toast = vi.spyOn(errorToast, 'showErrorToast').mockImplementation(() => {});
    reportPostMutationError(coded(status, code));
    expect(toast).toHaveBeenCalledTimes(1);
    expect(usePostErrorDialogStore.getState().error).toBeNull();
  });
});

describe('isPostDialogError', () => {
  it('is true only for the pop-up codes', () => {
    expect(isPostDialogError(coded(404, 'POST_NOT_FOUND'))).toBe(true);
    expect(isPostDialogError(coded(403, 'COMMENT_DELETE_FORBIDDEN'))).toBe(false);
    expect(isPostDialogError(coded(404))).toBe(false);
    expect(isPostDialogError(null)).toBe(false);
  });
});

describe('usePostErrorGuard', () => {
  function setup(loadErrors: unknown[], closeComments: () => void) {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const hook = renderHook(({ errors }) => usePostErrorGuard(errors, closeComments), {
      wrapper,
      initialProps: { errors: loadErrors },
    });
    return { ...hook, invalidate };
  }

  it('hides the comments modal and opens the pop-up when the post fails to load as gone', () => {
    const error = coded(404, 'POST_NOT_FOUND');
    const { result } = setup([error, null], vi.fn());
    expect(result.current.hideComments).toBe(true);
    expect(usePostErrorDialogStore.getState().error).toBe(error);
  });

  it('leaves the modal alone for a load failure without a pop-up code', () => {
    const { result } = setup([coded(500), null], vi.fn());
    expect(result.current.hideComments).toBe(false);
    expect(usePostErrorDialogStore.getState().error).toBeNull();
  });

  it('closes the comments modal and refetches the feed after the pop-up is dismissed', () => {
    const closeComments = vi.fn();
    const { invalidate } = setup([null, null], closeComments);
    act(() => usePostErrorDialogStore.getState().show(coded(404, 'POST_NOT_FOUND')));
    expect(closeComments).not.toHaveBeenCalled();
    act(() => usePostErrorDialogStore.getState().dismiss());
    expect(closeComments).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: feedKeys.all }));
  });
});
