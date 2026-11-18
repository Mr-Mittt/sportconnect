import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionErrorDialogStore } from '@/app/sessionErrorDialogStore';
import { useCloseOnSessionErrorDismissal } from './sessionErrors';

// CLIENT-SESSION-49: the Share dialog closes when the error dialog its own failure opened is dismissed ("Got it" closes both).

describe('useCloseOnSessionErrorDismissal', () => {
  beforeEach(() => {
    useSessionErrorDialogStore.setState({ error: null, dismissals: 0, lastDismissedForbidden: false });
  });

  it('runs close, once, on the first dismissal after it was armed', () => {
    const close = vi.fn();
    const { result } = renderHook(() => useCloseOnSessionErrorDismissal(close));

    act(() => result.current());
    expect(close).not.toHaveBeenCalled();

    act(() => useSessionErrorDialogStore.getState().dismiss(false));
    expect(close).toHaveBeenCalledTimes(1);

    // Disarmed again: a later dismissal (someone else's error) closes nothing.
    act(() => useSessionErrorDialogStore.getState().dismiss(false));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closes nothing for a dismissal nobody armed for', () => {
    const close = vi.fn();
    renderHook(() => useCloseOnSessionErrorDismissal(close));

    act(() => useSessionErrorDialogStore.getState().dismiss(false));
    act(() => useSessionErrorDialogStore.getState().dismiss(true));

    expect(close).not.toHaveBeenCalled();
  });

  it('closes on a 403-style dismissal as well, and arming is stable across renders', () => {
    const close = vi.fn();
    const { result, rerender } = renderHook(() => useCloseOnSessionErrorDismissal(close));
    const arm = result.current;
    rerender();
    expect(result.current).toBe(arm);

    act(() => arm());
    act(() => useSessionErrorDialogStore.getState().dismiss(true));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('calls the latest close, not the one from the first render', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(({ close }) => useCloseOnSessionErrorDismissal(close), {
      initialProps: { close: first },
    });
    rerender({ close: second });

    act(() => result.current());
    act(() => useSessionErrorDialogStore.getState().dismiss(false));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
