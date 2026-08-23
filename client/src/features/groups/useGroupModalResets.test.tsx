import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { useGroupInvitationsData } from './useGroupInvitationsData';

/**
 * CLIENT-MODAL-1, groups half.
 *
 * `RejectInvitationConfirmDialog`'s error comes from this hook's reject mutation, and the
 * dialog's close lives on `GroupsPage`. The hook therefore exposes `resetReject` rather
 * than resetting internally — it has no close event of its own to hang it on.
 *
 * `UpdateBroadcastConfirmDialog`'s `resetBroadcastUpdate` is the same shape on
 * `useGroupsPageData`; it is covered by that hook's own spec file.
 */

const testUser = {
  id: 'user-1',
  email: 'jordan@example.com',
  firstName: 'Jordan',
  lastName: 'Lee',
  username: 'jordanlee',
  phoneNumber: null,
  avatarUrl: null,
  roles: ['ROLE_USER'],
};

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  useAuthStore.setState({ user: testUser, accessToken: 'token', isBootstrapping: false });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useGroupInvitationsData — reject error does not survive close (CLIENT-MODAL-1)', () => {
  it('clears isRejectError via resetReject', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { success: true, message: '', data: [], timestamp: '' },
    });
    vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('reject failed'));

    const { result } = renderHook(
      () => useGroupInvitationsData(testUser.id, true, () => {}),
      { wrapper },
    );

    act(() => result.current.rejectInvitation(7, 'no thanks'));
    await waitFor(() => expect(result.current.isRejectError).toBe(true));

    // What GroupsPage's RejectInvitationConfirmDialog onClose now calls. Without it the
    // dialog reopens — for this invitation or any other — already showing the failure.
    act(() => result.current.resetReject());

    await waitFor(() => expect(result.current.isRejectError).toBe(false));
  });
});
