import { act, renderHook } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditProfileSave } from './useEditProfileSave';

const updateProfileAsync = vi.fn();
const updatePreferences = vi.fn();

vi.mock('./useUpdateMyProfile', () => ({
  useUpdateMyProfile: () => ({ updateProfileAsync, isPending: false, reset: vi.fn() }),
}));
vi.mock('./useUpdateMyPreferences', () => ({
  useUpdateMyPreferences: () => ({ updatePreferences, isPending: false, reset: vi.fn() }),
}));

function coded(status: number, errorCode: string, message: string): AxiosError {
  const error = new AxiosError('failed', 'ERR_BAD_REQUEST');
  error.response = { status, data: { success: false, message, errorCode, data: null } } as AxiosResponse;
  return error;
}

describe('useEditProfileSave — rejected country / region (CLIENT-ERR-8)', () => {
  beforeEach(() => {
    updateProfileAsync.mockReset();
    updatePreferences.mockReset();
  });

  it('exposes the geo code and leaves the message empty when only the profile half failed', async () => {
    updateProfileAsync.mockRejectedValueOnce(coded(400, 'REGION_UNKNOWN', 'Unknown region'));
    const { result } = renderHook(() => useEditProfileSave());

    await act(() => result.current.save({ profile: { regionId: 9 } }));

    expect(result.current.geoErrorCode).toBe('REGION_UNKNOWN');
    expect(result.current.errorMessage).toBeNull();
  });

  it('still reports a language that saved, beside the geo code', async () => {
    updateProfileAsync.mockRejectedValueOnce(coded(400, 'COUNTRY_UNKNOWN', 'Unknown country'));
    updatePreferences.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useEditProfileSave());

    await act(() => result.current.save({ profile: { countryId: 9 }, languageCode: 'vi' }));

    expect(result.current.geoErrorCode).toBe('COUNTRY_UNKNOWN');
    expect(result.current.errorMessage).not.toBeNull();
  });

  it('another coded failure keeps its message and sets no geo code', async () => {
    updateProfileAsync.mockRejectedValueOnce(coded(400, 'HEIGHT_OUT_OF_RANGE', 'Height out of range'));
    const { result } = renderHook(() => useEditProfileSave());

    await act(() => result.current.save({ profile: { heightCm: 999 } }));

    expect(result.current.geoErrorCode).toBeNull();
    expect(result.current.errorMessage).not.toBeNull();
  });

  it('clears the geo code on the next save attempt', async () => {
    updateProfileAsync.mockRejectedValueOnce(coded(400, 'REGION_UNKNOWN', 'Unknown region'));
    const { result } = renderHook(() => useEditProfileSave());
    await act(() => result.current.save({ profile: { regionId: 9 } }));

    updateProfileAsync.mockResolvedValueOnce(undefined);
    await act(() => result.current.save({ profile: { regionId: 5 } }));

    expect(result.current.geoErrorCode).toBeNull();
  });
});
