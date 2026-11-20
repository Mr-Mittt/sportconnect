import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import type { GroupInfo, GroupSettings } from '@/features/feed/types';
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

function info(overrides: Partial<GroupInfo> = {}): GroupInfo {
  return {
    groupId: 1,
    groupName: 'Riverside Ballers',
    isPrivate: false,
    description: null,
    avatarUrl: null,
    coverUrl: null,
    rules: null,
    schedule: null,
    updatedAt: '2026-07-15T00:00:00',
    ...overrides,
  };
}

/** Mocks both GET endpoints this hook fetches, matched by URL. */
function mockGetEndpoints(settingsData: GroupSettings, infoData: GroupInfo) {
  vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url === '/groups/1/settings') {
      return { data: { success: true, message: '', data: settingsData, timestamp: '' } };
    }
    if (url === '/groups/1/generalData') {
      return { data: { success: true, message: '', data: infoData, timestamp: '' } };
    }
    throw new Error(`unexpected GET ${url}`);
  });
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

  it('has no unsaved changes until a setting is edited away from its saved value', async () => {
    mockGetEndpoints(settings(), info());
    const { box } = renderGuard(1, true);
    await waitFor(() => expect(box.current?.settings).toBeDefined());

    expect(box.current?.hasUnsavedChanges).toBe(false);

    act(() => box.current?.updateSettingField('allowMemberInvites', true));
    expect(box.current?.hasUnsavedChanges).toBe(true);

    act(() => box.current?.updateSettingField('allowMemberInvites', false));
    expect(box.current?.hasUnsavedChanges).toBe(false);
  });

  it('has no unsaved changes until rules/schedule are edited away from their saved value', async () => {
    mockGetEndpoints(settings(), info({ rules: 'Be nice' }));
    const { box } = renderGuard(1, true);
    await waitFor(() => expect(box.current?.info).toBeDefined());

    expect(box.current?.hasUnsavedChanges).toBe(false);

    act(() => box.current?.updateInfoField('rules', 'Be nice and quiet'));
    expect(box.current?.hasUnsavedChanges).toBe(true);

    act(() => box.current?.updateInfoField('rules', 'Be nice'));
    expect(box.current?.hasUnsavedChanges).toBe(false);
  });

  it('guard() runs the action immediately when there are no unsaved changes', async () => {
    mockGetEndpoints(settings(), info());
    const { box } = renderGuard(1, true);
    await waitFor(() => expect(box.current?.settings).toBeDefined());

    const action = vi.fn();
    act(() => box.current?.guard(action));

    expect(action).toHaveBeenCalled();
    expect(box.current?.isLeaveDialogOpen).toBe(false);
  });

  it('guard() stashes the action and opens the dialog when there are unsaved changes', async () => {
    mockGetEndpoints(settings(), info());
    const { box } = renderGuard(1, true);
    await waitFor(() => expect(box.current?.settings).toBeDefined());
    act(() => box.current?.updateSettingField('allowMemberInvites', true));

    const action = vi.fn();
    act(() => box.current?.guard(action));

    expect(action).not.toHaveBeenCalled();
    expect(box.current?.isLeaveDialogOpen).toBe(true);
  });

  it('discard() clears both drafts and runs the pending guarded action', async () => {
    mockGetEndpoints(settings(), info({ schedule: 'Sundays' }));
    const { box } = renderGuard(1, true);
    await waitFor(() => expect(box.current?.settings).toBeDefined());
    act(() => box.current?.updateSettingField('allowMemberInvites', true));
    act(() => box.current?.updateInfoField('schedule', 'Mondays'));

    const action = vi.fn();
    act(() => box.current?.guard(action));
    act(() => box.current?.discard());

    expect(action).toHaveBeenCalled();
    expect(box.current?.hasUnsavedChanges).toBe(false);
    expect(box.current?.isLeaveDialogOpen).toBe(false);
  });

  it('cancelLeave() closes the dialog without discarding or running the action', async () => {
    mockGetEndpoints(settings(), info());
    const { box } = renderGuard(1, true);
    await waitFor(() => expect(box.current?.settings).toBeDefined());
    act(() => box.current?.updateSettingField('allowMemberInvites', true));

    const action = vi.fn();
    act(() => box.current?.guard(action));
    act(() => box.current?.cancelLeave());

    expect(action).not.toHaveBeenCalled();
    expect(box.current?.hasUnsavedChanges).toBe(true);
    expect(box.current?.isLeaveDialogOpen).toBe(false);
  });

  it('save() persists only the settings draft when only a toggle changed', async () => {
    mockGetEndpoints(settings(), info());
    const { box } = renderGuard(1, true);
    await waitFor(() => expect(box.current?.settings).toBeDefined());
    act(() => box.current?.updateSettingField('allowMemberInvites', true));

    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValueOnce({
      data: { success: true, message: '', data: settings({ allowMemberInvites: true }), timestamp: '' },
    });

    const action = vi.fn();
    act(() => box.current?.guard(action));
    await act(async () => box.current?.save());

    await waitFor(() => expect(box.current?.hasUnsavedChanges).toBe(false));
    expect(putSpy).toHaveBeenCalledWith('/groups/1/settings', { allowMemberInvites: true });
    expect(putSpy).not.toHaveBeenCalledWith('/groups/1', expect.anything());
    expect(action).toHaveBeenCalled();
  });

  it('save() persists only the rules/schedule draft when only General changed', async () => {
    mockGetEndpoints(settings(), info());
    const { box } = renderGuard(1, true);
    await waitFor(() => expect(box.current?.info).toBeDefined());
    act(() => box.current?.updateInfoField('rules', 'Be kind'));

    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValueOnce({
      data: { success: true, message: '', data: info({ rules: 'Be kind' }), timestamp: '' },
    });

    await act(async () => box.current?.save());

    await waitFor(() => expect(box.current?.hasUnsavedChanges).toBe(false));
    expect(putSpy).toHaveBeenCalledWith('/groups/1/generalData', { rules: 'Be kind' });
    expect(putSpy).not.toHaveBeenCalledWith('/groups/1/settings', expect.anything());
    expect(box.current?.info?.rules).toBe('Be kind');
  });

  it('save() persists both drafts when both sections changed', async () => {
    mockGetEndpoints(settings(), info());
    const { box } = renderGuard(1, true);
    await waitFor(() => expect(box.current?.settings).toBeDefined());
    act(() => box.current?.updateSettingField('allowMemberInvites', true));
    act(() => box.current?.updateInfoField('schedule', 'Sundays'));

    const putSpy = vi.spyOn(apiClient, 'put').mockImplementation(async (url: string) => {
      if (url === '/groups/1/settings') {
        return {
          data: { success: true, message: '', data: settings({ allowMemberInvites: true }), timestamp: '' },
        };
      }
      return {
        data: { success: true, message: '', data: info({ schedule: 'Sundays' }), timestamp: '' },
      };
    });

    await act(async () => box.current?.save());

    await waitFor(() => expect(box.current?.hasUnsavedChanges).toBe(false));
    expect(putSpy).toHaveBeenCalledWith('/groups/1/settings', { allowMemberInvites: true });
    expect(putSpy).toHaveBeenCalledWith('/groups/1/generalData', { schedule: 'Sundays' });
  });

  it('blocks in-app navigation away while dirty, and discard proceeds it', async () => {
    mockGetEndpoints(settings(), info());
    const { box, router } = renderGuard(1, true);
    await waitFor(() => expect(box.current?.settings).toBeDefined());
    act(() => box.current?.updateSettingField('allowMemberInvites', true));

    await act(async () => router.navigate('/'));

    await waitFor(() => expect(box.current?.isLeaveDialogOpen).toBe(true));
    expect(router.state.location.pathname).toBe('/groups');

    act(() => box.current?.discard());
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  // ---- CLIENT-GROUP-SESSION-4: rules/schedule save when the field loses focus; Permission has its own Save ----------------

  describe('rules/schedule save on blur, Permission Save', () => {
    function okInfo(data: GroupInfo) {
      return { data: { success: true, message: '', data, timestamp: '' } };
    }

    it('commitInfoField saves just that field (a partial PUT), and the text stays shown while it saves', async () => {
      mockGetEndpoints(settings(), info({ rules: 'Be nice', schedule: 'Sundays' }));
      const { box } = renderGuard(1, true);
      await waitFor(() => expect(box.current?.info).toBeDefined());

      let resolvePut: (value: ReturnType<typeof okInfo>) => void = () => {};
      const putSpy = vi.spyOn(apiClient, 'put').mockReturnValueOnce(new Promise((resolve) => { resolvePut = resolve; }));
      act(() => box.current?.updateInfoField('rules', 'Be nice and quiet'));
      await act(async () => box.current?.commitInfoField('rules'));

      expect(putSpy).toHaveBeenCalledTimes(1);
      expect(putSpy).toHaveBeenCalledWith('/groups/1/generalData', { rules: 'Be nice and quiet' });
      // While the save is in flight: the new text is still what the field shows, and it is not a dirty draft (leaving the tab must not raise the dialog).
      expect(box.current?.info?.rules).toBe('Be nice and quiet');
      expect(box.current?.hasUnsavedChanges).toBe(false);

      await act(async () => resolvePut(okInfo(info({ rules: 'Be nice and quiet', schedule: 'Sundays' }))));
      await waitFor(() => expect(box.current?.info?.rules).toBe('Be nice and quiet'));
      expect(box.current?.hasUnsavedChanges).toBe(false);
      expect(box.current?.infoFieldError).toBeNull();
    });

    it('commitInfoField sends nothing when the field is back at its saved value, or was never edited', async () => {
      mockGetEndpoints(settings(), info({ rules: 'Be nice' }));
      const { box } = renderGuard(1, true);
      await waitFor(() => expect(box.current?.info).toBeDefined());
      const putSpy = vi.spyOn(apiClient, 'put');

      await act(async () => box.current?.commitInfoField('rules'));
      act(() => box.current?.updateInfoField('rules', 'Be nice'));
      await act(async () => box.current?.commitInfoField('rules'));

      expect(putSpy).not.toHaveBeenCalled();
      expect(box.current?.hasUnsavedChanges).toBe(false);
    });

    it('a failed field save puts the text back into the draft (dirty, guarded) and names the field; the next commit clears the error', async () => {
      mockGetEndpoints(settings(), info({ rules: 'Be nice', schedule: 'Sundays' }));
      const { box } = renderGuard(1, true);
      await waitFor(() => expect(box.current?.info).toBeDefined());

      vi.spyOn(apiClient, 'put').mockRejectedValueOnce(new Error('boom'));
      act(() => box.current?.updateInfoField('rules', 'Be nice and quiet'));
      await act(async () => box.current?.commitInfoField('rules'));

      await waitFor(() => expect(box.current?.infoFieldError?.key).toBe('rules'));
      expect(box.current?.info?.rules).toBe('Be nice and quiet');
      expect(box.current?.hasUnsavedChanges).toBe(true);

      vi.spyOn(apiClient, 'put').mockResolvedValueOnce(okInfo(info({ rules: 'Be nice', schedule: 'Mondays' })));
      act(() => box.current?.updateInfoField('schedule', 'Mondays'));
      await act(async () => box.current?.commitInfoField('schedule'));
      await waitFor(() => expect(box.current?.infoFieldError).toBeNull());
    });

    it('two fields saved one right after the other both settle (neither is left saving)', async () => {
      mockGetEndpoints(settings(), info({ rules: 'a', schedule: 'b' }));
      const { box } = renderGuard(1, true);
      await waitFor(() => expect(box.current?.info).toBeDefined());

      vi.spyOn(apiClient, 'put').mockImplementation(async (_url: string, body: unknown) =>
        okInfo(info({ rules: 'a2', schedule: 'b2', ...(body as Partial<GroupInfo>) })),
      );
      act(() => {
        box.current?.updateInfoField('rules', 'a2');
        box.current?.updateInfoField('schedule', 'b2');
      });
      await act(async () => {
        box.current?.commitInfoField('rules');
        box.current?.commitInfoField('schedule');
      });

      await waitFor(() => expect(box.current?.info?.schedule).toBe('b2'));
      expect(box.current?.info?.rules).toBe('a2');
      expect(box.current?.hasUnsavedChanges).toBe(false);
    });

    it('saveSettings saves only the Permission toggles and leaves a failed rules draft for the dialog Save', async () => {
      mockGetEndpoints(settings(), info({ rules: 'Be nice' }));
      const { box } = renderGuard(1, true);
      await waitFor(() => expect(box.current?.info).toBeDefined());

      vi.spyOn(apiClient, 'put').mockRejectedValueOnce(new Error('boom'));
      act(() => box.current?.updateInfoField('rules', 'Be nice and quiet'));
      await act(async () => box.current?.commitInfoField('rules'));
      await waitFor(() => expect(box.current?.infoFieldError?.key).toBe('rules'));

      const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValueOnce({
        data: { success: true, message: '', data: settings({ allowMemberInvites: true }), timestamp: '' },
      });
      putSpy.mockClear(); // the same spy also counted the failed rules save above
      act(() => box.current?.updateSettingField('allowMemberInvites', true));
      expect(box.current?.hasSettingsChanges).toBe(true);
      await act(async () => box.current?.saveSettings());

      await waitFor(() => expect(box.current?.hasSettingsChanges).toBe(false));
      expect(putSpy).toHaveBeenCalledTimes(1);
      expect(putSpy).toHaveBeenCalledWith('/groups/1/settings', { allowMemberInvites: true });
      // The rules draft that failed is still there, and still guarded.
      expect(box.current?.info?.rules).toBe('Be nice and quiet');
      expect(box.current?.hasUnsavedChanges).toBe(true);
    });

    it('a failed Permission save keeps the draft and reports the error', async () => {
      mockGetEndpoints(settings(), info());
      const { box } = renderGuard(1, true);
      await waitFor(() => expect(box.current?.settings).toBeDefined());

      vi.spyOn(apiClient, 'put').mockRejectedValueOnce(new Error('boom'));
      act(() => box.current?.updateSettingField('allowMemberInvites', true));
      await act(async () => box.current?.saveSettings());

      await waitFor(() => expect(box.current?.isSettingsSaveError).toBe(true));
      expect(box.current?.hasSettingsChanges).toBe(true);
    });

    it('hasSettingsChanges is only about the toggles, not rules/schedule', async () => {
      mockGetEndpoints(settings(), info({ rules: 'Be nice' }));
      const { box } = renderGuard(1, true);
      await waitFor(() => expect(box.current?.info).toBeDefined());

      act(() => box.current?.updateInfoField('rules', 'changed'));
      expect(box.current?.hasUnsavedChanges).toBe(true);
      expect(box.current?.hasSettingsChanges).toBe(false);
    });
  });

  it('does not fetch settings/info and reports no unsaved changes when the tab is inactive', () => {
    const getSpy = vi.spyOn(apiClient, 'get');
    const { box } = renderGuard(1, false);

    expect(getSpy).not.toHaveBeenCalled();
    expect(box.current?.hasUnsavedChanges).toBe(false);
  });
});
