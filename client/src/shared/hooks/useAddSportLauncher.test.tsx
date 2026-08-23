import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAddSportLauncher } from './useAddSportLauncher';

/**
 * SPORT-5's core behaviour: what the "Add sport" pill decides, and on what data.
 *
 * Asserted on the number of `GET /sports` calls rather than only on the outcome — a
 * cached render produces the right outcome for the wrong reason, and "we re-read before
 * deciding" is the actual contract this ticket adds.
 */

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function catalogResponse(sports: Array<{ id: number; name: string }>) {
  return {
    data: {
      success: true,
      message: '',
      data: sports.map((sport) => ({ ...sport, iconUrl: null })),
      timestamp: '',
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useAddSportLauncher (SPORT-5)', () => {
  it('re-reads the catalogue before deciding, and opens the picker when something is addable', async () => {
    const onOpenPicker = vi.fn();
    // Starts with only Football; Basketball is activated after the initial load. Before
    // SPORT-5 the click would have decided on the first response and missed it entirely.
    const getSpy = vi
      .spyOn(apiClient, 'get')
      .mockResolvedValueOnce(catalogResponse([{ id: 5, name: 'Football' }]))
      .mockResolvedValue(
        catalogResponse([
          { id: 5, name: 'Football' },
          { id: 6, name: 'Basketball' },
        ]),
      );

    const { result } = renderHook(
      () => useAddSportLauncher({ heldSportKeys: ['football'], onOpenPicker }),
      { wrapper },
    );
    await waitFor(() => expect(getSpy).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.launch();
    });

    expect(getSpy).toHaveBeenCalledTimes(2);
    expect(onOpenPicker).toHaveBeenCalledTimes(1);
    expect(result.current.isDialogOpen).toBe(false);
  });

  it('opens the dialog, not the picker, when every catalogue sport is held', async () => {
    const onOpenPicker = vi.fn();
    vi.spyOn(apiClient, 'get').mockResolvedValue(
      catalogResponse([{ id: 5, name: 'Football' }]),
    );

    const { result } = renderHook(
      () => useAddSportLauncher({ heldSportKeys: ['football'], onOpenPicker }),
      { wrapper },
    );

    await act(async () => {
      await result.current.launch();
    });

    expect(onOpenPicker).not.toHaveBeenCalled();
    expect(result.current.isDialogOpen).toBe(true);
    expect(result.current.isCatalogUnavailable).toBe(false);
  });

  it('does not claim completeness when the re-read fails and nothing is cached', async () => {
    const onOpenPicker = vi.fn();
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('offline'));

    const { result } = renderHook(
      () => useAddSportLauncher({ heldSportKeys: [], onOpenPicker }),
      { wrapper },
    );

    await act(async () => {
      await result.current.launch();
    });

    expect(onOpenPicker).not.toHaveBeenCalled();
    expect(result.current.isDialogOpen).toBe(true);
    // The distinction this ticket turns on: unknown, not complete.
    expect(result.current.isCatalogUnavailable).toBe(true);
  });

  it('falls back to the cached catalogue when the re-read fails but data is known', async () => {
    const onOpenPicker = vi.fn();
    vi.spyOn(apiClient, 'get')
      .mockResolvedValueOnce(catalogResponse([{ id: 5, name: 'Football' }]))
      .mockRejectedValue(new Error('offline'));

    const { result } = renderHook(
      () => useAddSportLauncher({ heldSportKeys: [], onOpenPicker }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isCheckingCatalog).toBe(false));

    await act(async () => {
      await result.current.launch();
    });

    // Football is still addable per the cached list, so a failed re-read must not block
    // an add the user could perfectly well complete.
    expect(onOpenPicker).toHaveBeenCalledTimes(1);
    expect(result.current.isDialogOpen).toBe(false);
  });

  it('retry opens the picker once a sport becomes available', async () => {
    const onOpenPicker = vi.fn();
    // A flag rather than mockRejectedValueOnce chains: the number of calls before retry()
    // depends on whether the mount query has settled yet, which made a fixed sequence flaky.
    let isOffline = true;
    vi.spyOn(apiClient, 'get').mockImplementation(async () => {
      if (isOffline) throw new Error('offline');
      return catalogResponse([{ id: 5, name: 'Football' }]);
    });

    const { result } = renderHook(
      () => useAddSportLauncher({ heldSportKeys: [], onOpenPicker }),
      { wrapper },
    );

    await act(async () => {
      await result.current.launch();
    });
    expect(result.current.isCatalogUnavailable).toBe(true);

    isOffline = false;
    await act(async () => {
      await result.current.retry();
    });

    expect(onOpenPicker).toHaveBeenCalledTimes(1);
    expect(result.current.isDialogOpen).toBe(false);
  });
});
