import { act, render, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard';

type Guard = ReturnType<typeof useUnsavedChangesGuard>;

/**
 * `useBlocker` only works inside a data router — same two-route memory-router
 * harness `useSettingsUnsavedGuard.test.tsx` (`features/groups/`) already
 * uses, re-parameterized on `hasUnsavedChanges` directly since this hook
 * takes no data of its own.
 */
function renderGuard(
  hasUnsavedChanges: boolean,
  isSamePage?: (fromPath: string, toPath: string) => boolean,
  start = '/a',
) {
  const box: { current: Guard | null } = { current: null };
  function Harness() {
    box.current = useUnsavedChangesGuard(hasUnsavedChanges, isSamePage);
    return null;
  }
  const router = createMemoryRouter(
    [
      { path: '/a', element: <Harness /> },
      { path: '/a/:id', element: <Harness /> },
      { path: '/b', element: <div>Elsewhere</div> },
    ],
    { initialEntries: [start] },
  );
  render(<RouterProvider router={router} />);
  return { box, router };
}

describe('useUnsavedChangesGuard', () => {
  it('guard() runs the action immediately when there are no unsaved changes', () => {
    const { box } = renderGuard(false);
    const action = vi.fn();

    act(() => box.current?.guard(action));

    expect(action).toHaveBeenCalled();
    expect(box.current?.isLeaveDialogOpen).toBe(false);
  });

  it('guard() stashes the action and opens the dialog when there are unsaved changes', () => {
    const { box } = renderGuard(true);
    const action = vi.fn();

    act(() => box.current?.guard(action));

    expect(action).not.toHaveBeenCalled();
    expect(box.current?.isLeaveDialogOpen).toBe(true);
  });

  it('proceed() runs the pending guarded action and closes the dialog', () => {
    const { box } = renderGuard(true);
    const action = vi.fn();
    act(() => box.current?.guard(action));

    act(() => box.current?.proceed());

    expect(action).toHaveBeenCalled();
    expect(box.current?.isLeaveDialogOpen).toBe(false);
  });

  it('cancelLeave() closes the dialog without running the action', () => {
    const { box } = renderGuard(true);
    const action = vi.fn();
    act(() => box.current?.guard(action));

    act(() => box.current?.cancelLeave());

    expect(action).not.toHaveBeenCalled();
    expect(box.current?.isLeaveDialogOpen).toBe(false);
  });

  it('blocks in-app navigation away while dirty, and proceed() lets it through', async () => {
    const { box, router } = renderGuard(true);

    await act(async () => router.navigate('/b'));

    await waitFor(() => expect(box.current?.isLeaveDialogOpen).toBe(true));
    expect(router.state.location.pathname).toBe('/a');

    act(() => box.current?.proceed());
    await waitFor(() => expect(router.state.location.pathname).toBe('/b'));
  });

  describe('isSamePage (a route change the page makes while it stays mounted)', () => {
    const sameArea = (from: string, to: string) => from.startsWith('/a') && to.startsWith('/a');

    it('lets a move inside the page through while dirty, in both directions', async () => {
      const { box, router } = renderGuard(true, sameArea);

      await act(async () => router.navigate('/a/5'));
      expect(box.current?.isLeaveDialogOpen).toBe(false);
      expect(router.state.location.pathname).toBe('/a/5');

      await act(async () => router.navigate('/a', { replace: true }));
      expect(box.current?.isLeaveDialogOpen).toBe(false);
      expect(router.state.location.pathname).toBe('/a');
    });

    it('still blocks a move to another page while dirty', async () => {
      const { box, router } = renderGuard(true, sameArea, '/a/5');

      await act(async () => router.navigate('/b'));

      await waitFor(() => expect(box.current?.isLeaveDialogOpen).toBe(true));
      expect(router.state.location.pathname).toBe('/a/5');
    });
  });

  it('does not block in-app navigation when there are no unsaved changes', async () => {
    const { box, router } = renderGuard(false);

    await act(async () => router.navigate('/b'));

    expect(box.current?.isLeaveDialogOpen).toBe(false);
    expect(router.state.location.pathname).toBe('/b');
  });
});
