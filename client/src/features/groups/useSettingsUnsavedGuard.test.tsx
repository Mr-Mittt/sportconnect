import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import type { GroupSettings } from '@/features/feed/types';
import { useSettingsUnsavedGuard } from './useSettingsUnsavedGuard';

function settings(overrides: Partial<GroupSettings> = {}): GroupSettings {
  return {
    id: 1,
    groupId: 1,
    allowMemberPosts: true,
    requirePostApproval: false,
    allowMemberInvites: false,
    groupTypeName: 'DEFAULT',
    createdAt: '2026-07-15T00:00:00',
    updatedAt: '2026-07-15T00:00:00',
    ...overrides,
  };
}

type Guard = ReturnType<typeof useSettingsUnsavedGuard>;

/**
 * `useBlocker` only works inside a data router — a plain `wrapper` (as
 * `renderHook` normally uses) can't supply that, since `RouterProvider`
 * ignores `children` and renders whichever route matched instead. Builds a
 * two-route memory router (a "/groups" leaf hosting the hook, a "/" leaf to
 * navigate to) and exposes the hook's latest return value via a mutable box
 * updated on every render.
 */
function renderGuard(groupId: number | undefined, isActive: boolean) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const box: { current: Guard | null } = { current: null };
  function Harness() {
    box.current = useSettingsUnsavedGuard(groupId, isActive);
    return null;
  }
  const router = createMemoryRouter(
    [
      { path: '/groups', element: <Harness /> },
      { path: '/', element: <div>Home</div> },
    ],
    { initialEntries: ['/groups'] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { box, router };
}

describe('useSettingsUnsavedGuard', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('has no unsaved changes until a field is edited away from its saved value', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { success: true, message: '', data: settings(), timestamp: '' },
    });
    const { box } = renderGuard(1, true);
    await waitFor(() => expect(box.current?.settings).toBeDefined());

    expect(box.current?.hasUnsavedChanges).toBe(false);

    act(() => box.current?.updateField('allowMemberInvites', true));
    expect(box.current?.hasUnsavedChanges).toBe(true);

    act(() => box.current?.updateField('allowMemberInvites', false));
    expect(box.current?.hasUnsavedChanges).toBe(false);
  });

  it('guard() runs the action immediately when there are no unsaved changes', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { success: true, message: '', data: settings(), timestamp: '' },
    });
    const { box } = renderGuard(1, true);
    await waitFor(() => expect(box.current?.settings).toBeDefined());

    const action = vi.fn();
    act(() => box.current?.guard(action));

    expect(action).toHaveBeenCalled();
    expect(box.current?.isLeaveDialogOpen).toBe(false);
  });

  it('guard() stashes the action and opens the dialog when there are unsaved changes', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { success: true, message: '', data: settings(), timestamp: '' },
    });
    const { box } = renderGuard(1, true);
    await waitFor(() => expect(box.current?.settings).toBeDefined());
    act(() => box.current?.updateField('allowMemberInvites', true));

    const action = vi.fn();
    act(() => box.current?.guard(action));

    expect(action).not.toHaveBeenCalled();
    expect(box.current?.isLeaveDialogOpen).toBe(true);
  });

  it('discard() clears the draft and runs the pending guarded action', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { success: true, message: '', data: settings(), timestamp: '' },
    });
    const { box } = renderGuard(1, true);
    await waitFor(() => expect(box.current?.settings).toBeDefined());
    act(() => box.current?.updateField('allowMemberInvites', true));

    const action = vi.fn();
    act(() => box.current?.guard(action));
    act(() => box.current?.discard());

    expect(action).toHaveBeenCalled();
    expect(box.current?.hasUnsavedChanges).toBe(false);
    expect(box.current?.isLeaveDialogOpen).toBe(false);
  });

  it('cancelLeave() closes the dialog without discarding or running the action', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { success: true, message: '', data: settings(), timestamp: '' },
    });
    const { box } = renderGuard(1, true);
    await waitFor(() => expect(box.current?.settings).toBeDefined());
    act(() => box.current?.updateField('allowMemberInvites', true));

    const action = vi.fn();
    act(() => box.current?.guard(action));
    act(() => box.current?.cancelLeave());

    expect(action).not.toHaveBeenCalled();
    expect(box.current?.hasUnsavedChanges).toBe(true);
    expect(box.current?.isLeaveDialogOpen).toBe(false);
  });

  it('save() persists the draft, clears it on success, and runs the pending action', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { success: true, message: '', data: settings(), timestamp: '' },
    });
    const { box } = renderGuard(1, true);
    await waitFor(() => expect(box.current?.settings).toBeDefined());
    act(() => box.current?.updateField('allowMemberInvites', true));

    vi.spyOn(apiClient, 'put').mockResolvedValueOnce({
      data: {
        success: true,
        message: '',
        data: settings({ allowMemberInvites: true }),
        timestamp: '',
      },
    });

    const action = vi.fn();
    act(() => box.current?.guard(action));
    await act(async () => box.current?.save());

    await waitFor(() => expect(box.current?.hasUnsavedChanges).toBe(false));
    expect(apiClient.put).toHaveBeenCalledWith('/groups/1/settings', { allowMemberInvites: true });
    expect(action).toHaveBeenCalled();
  });

  it('blocks in-app navigation away while dirty, and discard proceeds it', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { success: true, message: '', data: settings(), timestamp: '' },
    });
    const { box, router } = renderGuard(1, true);
    await waitFor(() => expect(box.current?.settings).toBeDefined());
    act(() => box.current?.updateField('allowMemberInvites', true));

    await act(async () => router.navigate('/'));

    await waitFor(() => expect(box.current?.isLeaveDialogOpen).toBe(true));
    expect(router.state.location.pathname).toBe('/groups');

    act(() => box.current?.discard());
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('does not fetch settings and reports no unsaved changes when the tab is inactive', () => {
    const getSpy = vi.spyOn(apiClient, 'get');
    const { box } = renderGuard(1, false);

    expect(getSpy).not.toHaveBeenCalled();
    expect(box.current?.hasUnsavedChanges).toBe(false);
  });
});
