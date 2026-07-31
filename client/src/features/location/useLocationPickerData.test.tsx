import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useLocationPickerData } from './useLocationPickerData';
import type { Location } from './types';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const location: Location = {
  id: 1,
  sportId: 1,
  sportName: 'Football',
  name: 'Riverside Sports Complex',
  address: '123 Main St',
  latitude: 21.0285,
  longitude: 105.8542,
  sourceMapsUrl: null,
  claimedByVendorId: null,
  createdBy: 'user-1',
  createdAt: '2026-07-30T00:00:00',
  updatedAt: '2026-07-30T00:00:00',
};

const emptyPage = {
  content: [],
  totalPages: 1,
  totalElements: 0,
  number: 0,
  size: 20,
  first: true,
  last: true,
  numberOfElements: 0,
  empty: true,
};

describe('useLocationPickerData', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('starts in search mode and switches to create/back to search', () => {
    const { result } = renderHook(() => useLocationPickerData(1, true, vi.fn(), vi.fn()), { wrapper });
    expect(result.current.mode).toBe('search');

    act(() => result.current.onSwitchToCreate());
    expect(result.current.mode).toBe('create');

    act(() => result.current.onSwitchToSearch());
    expect(result.current.mode).toBe('search');
  });

  it('submits the trimmed search keyword and triggers the search query', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { success: true, message: '', data: emptyPage, timestamp: '' },
    });
    const { result } = renderHook(() => useLocationPickerData(1, true, vi.fn(), vi.fn()), { wrapper });

    act(() => result.current.onInputChange('  riverside  '));
    act(() => result.current.onSearch());

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith('/locations/search', {
        params: { sportId: 1, q: 'riverside' },
      }),
    );
  });

  it('selecting a search result calls onSelect and onClose', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const { result } = renderHook(() => useLocationPickerData(1, true, onSelect, onClose), { wrapper });

    act(() => result.current.onSelectResult(location));
    expect(onSelect).toHaveBeenCalledWith(location);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('resolving a URL sets coordinates and bumps mapSeed, and prefills the name when blank', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: {
        success: true,
        message: '',
        data: { latitude: 21.0285, longitude: 105.8542, suggestedName: 'Riverside Sports Complex' },
        timestamp: '',
      },
    });
    const { result } = renderHook(() => useLocationPickerData(1, true, vi.fn(), vi.fn()), { wrapper });

    act(() => result.current.onMapsUrlChange('https://maps.app.goo.gl/abc'));
    act(() => result.current.onResolveUrl());

    await waitFor(() => expect(result.current.coordinates).toEqual({ latitude: 21.0285, longitude: 105.8542 }));
    expect(result.current.mapSeed).toBe(1);
    expect(result.current.name).toBe('Riverside Sports Complex');
  });

  it('does not overwrite a name the user already typed with the resolved suggestion', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: {
        success: true,
        message: '',
        data: { latitude: 21.0285, longitude: 105.8542, suggestedName: 'Suggested Name' },
        timestamp: '',
      },
    });
    const { result } = renderHook(() => useLocationPickerData(1, true, vi.fn(), vi.fn()), { wrapper });

    act(() => result.current.onNameChange('My Own Name'));
    act(() => result.current.onMapsUrlChange('https://maps.app.goo.gl/abc'));
    act(() => result.current.onResolveUrl());

    await waitFor(() => expect(result.current.coordinates).not.toBeNull());
    expect(result.current.name).toBe('My Own Name');
  });

  it('a resolve with null coordinates leaves coordinates unset (graceful fallback, not an error)', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { success: true, message: '', data: { latitude: null, longitude: null, suggestedName: null }, timestamp: '' },
    });
    const { result } = renderHook(() => useLocationPickerData(1, true, vi.fn(), vi.fn()), { wrapper });

    act(() => result.current.onMapsUrlChange('https://maps.app.goo.gl/unresolvable'));
    act(() => result.current.onResolveUrl());

    await waitFor(() => expect(result.current.resolvedNoCoordinates).toBe(true));
    expect(result.current.coordinates).toBeNull();
  });

  it('moving the pin updates coordinates without bumping mapSeed', () => {
    const { result } = renderHook(() => useLocationPickerData(1, true, vi.fn(), vi.fn()), { wrapper });
    act(() => result.current.onMovePin(10, 20));
    expect(result.current.coordinates).toEqual({ latitude: 10, longitude: 20 });
    expect(result.current.mapSeed).toBe(0);
  });

  it('canSave is false until a name is entered', () => {
    const { result } = renderHook(() => useLocationPickerData(1, true, vi.fn(), vi.fn()), { wrapper });
    expect(result.current.canSave).toBe(false);
    act(() => result.current.onNameChange('Riverside Sports Complex'));
    expect(result.current.canSave).toBe(true);
    act(() => result.current.onNameChange('   '));
    expect(result.current.canSave).toBe(false);
  });

  it('saving a new location posts the form fields and calls onSelect/onClose on success', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { success: true, message: '', data: location, timestamp: '' },
    });
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const { result } = renderHook(() => useLocationPickerData(1, true, onSelect, onClose), { wrapper });

    act(() => result.current.onNameChange('Riverside Sports Complex'));
    act(() => result.current.onAddressChange('123 Main St'));
    act(() => result.current.onMovePin(21.0285, 105.8542));
    act(() => result.current.onSave());

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(location));
    expect(apiClient.post).toHaveBeenCalledWith('/locations', {
      sportId: 1,
      name: 'Riverside Sports Complex',
      address: '123 Main St',
      latitude: 21.0285,
      longitude: 105.8542,
      sourceMapsUrl: undefined,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('resets all transient state after the dialog closes', () => {
    const { result, rerender } = renderHook(
      ({ isOpen }: { isOpen: boolean }) => useLocationPickerData(1, isOpen, vi.fn(), vi.fn()),
      { wrapper, initialProps: { isOpen: true } },
    );

    act(() => result.current.onSwitchToCreate());
    act(() => result.current.onNameChange('Draft Name'));
    expect(result.current.mode).toBe('create');
    expect(result.current.name).toBe('Draft Name');

    rerender({ isOpen: false });

    expect(result.current.mode).toBe('search');
    expect(result.current.name).toBe('');
  });
});
