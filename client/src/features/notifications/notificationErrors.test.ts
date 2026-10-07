import { QueryClient } from '@tanstack/react-query';
import { AxiosError, type AxiosResponse } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { refetchWhenNotificationGone } from './notificationErrors';
import { notificationKeys } from './queryKeys';

function coded(status: number, errorCode: string): AxiosError {
  const error = new AxiosError('failed', 'ERR_BAD_REQUEST');
  error.response = { status, data: { success: false, message: 'x', errorCode, data: null } } as AxiosResponse;
  return error;
}

describe('refetchWhenNotificationGone', () => {
  it.each([
    coded(404, 'NOTIFICATION_NOT_FOUND'),
    coded(403, 'NOTIFICATION_FORBIDDEN'),
  ])('refetches the list and the unread count for %s', (error) => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    refetchWhenNotificationGone(queryClient, error);

    expect(invalidate).toHaveBeenCalledWith({ queryKey: notificationKeys.list() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: notificationKeys.unreadCount });
  });

  it.each([coded(500, 'INTERNAL_ERROR'), new Error('network error')])('leaves other failures alone', (error) => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    refetchWhenNotificationGone(queryClient, error);

    expect(invalidate).not.toHaveBeenCalled();
  });
});
