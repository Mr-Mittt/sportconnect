import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import type { ResolvedSportAttributeSchema } from '@/shared/types/sport';
import { sessionAttributeSchemaQueryKey, useSessionAttributeSchema } from './useSessionAttributeSchema';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function apiResponse<T>(data: T) {
  return { data: { success: true, message: '', data, timestamp: '' } };
}

// setup -> (own BOOLEAN ballsProvided) + (#ref-derived tension, carrying A17's prefill markers).
const schema: ResolvedSportAttributeSchema = {
  groups: [
    {
      key: 'setup',
      label: 'Setup',
      isAvailable: true,
      attributes: [
        { key: 'ballsProvided', label: 'Balls provided?', type: 'BOOLEAN', isAvailable: true },
        {
          key: 'tension',
          label: 'Tension',
          type: 'NUMBER',
          isAvailable: true,
          min: 15,
          max: 35,
          prefillable: true,
          prefillKey: 'gear/rackets/tension',
        },
      ],
    },
  ],
};

describe('useSessionAttributeSchema', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does not fetch while sportId is undefined', () => {
    const spy = vi.spyOn(apiClient, 'get');
    const { result } = renderHook(() => useSessionAttributeSchema(undefined), { wrapper });

    expect(spy).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeNull();
  });

  it('resolves the schema from GET /sports/{sportId}/session-attribute-schema, prefill markers intact', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce(apiResponse(schema));

    const { result } = renderHook(() => useSessionAttributeSchema(7), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(apiClient.get).toHaveBeenCalledWith('/sports/7/session-attribute-schema');
    expect(result.current.isError).toBe(false);
    expect(result.current.data).toEqual(schema);
    expect(result.current.data?.groups[0].attributes[1]).toMatchObject({
      prefillable: true,
      prefillKey: 'gear/rackets/tension',
    });
  });

  it('returns null (not an error) for a sport whose sessions offer no attributes', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce(apiResponse(null));

    const { result } = renderHook(() => useSessionAttributeSchema(7), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.isError).toBe(false);
  });

  it('surfaces a fetch failure (e.g. 404 for a deactivated sport) as isError', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValueOnce(new Error('Request failed with status code 404'));

    const { result } = renderHook(() => useSessionAttributeSchema(7), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('keys the query by sport id', () => {
    expect(sessionAttributeSchemaQueryKey(7)).toEqual(['sessionAttributeSchema', 7]);
  });
});
