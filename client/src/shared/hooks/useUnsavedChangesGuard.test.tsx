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
function renderGuard(hasUnsavedChanges: boolean) {
  const box: { current: Guard | null } = { current: null };
  function Harness() {
    box.current = useUnsavedChangesGuard(hasUnsavedChanges);
    return null;
  }
  const router = createMemoryRouter(
    [
      { path: '/a', element: <Harness /> },
      { path: '/b', element: <div>Elsewhere</div> },
    ],
    { initialEntries: ['/a'] },
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

  it('does not block in-app navigation when there are no unsaved changes', async () => {
    const { box, router } = renderGuard(false);

    await act(async () => router.navigate('/b'));

    expect(box.current?.isLeaveDialogOpen).toBe(false);
    expect(router.state.location.pathname).toBe('/b');
  });
});
