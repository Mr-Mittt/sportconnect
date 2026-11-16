import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import badminton from '../recordSchema/badminton-record-schema-v1.json';
import { parseRecordSchema, type RecordSchema } from '../recordSchema';
import type { RecordChangeSetResponse } from '../resultTypes';
import { MAX_NOTICES, useRecordCommands } from './useRecordCommands';
import type { SessionResultData } from './useSessionResultData';
import type { Segment } from '@/shared/lib/mentionMarkup';

// CLIENT-GL-39: the record commands of the comment box.

const PEOPLE: Array<{ id: string; name: string }> = [
  { id: 'u-bao', name: 'Bao' },
  { id: 'u-an', name: 'An' },
  { id: 'u-binh', name: 'Bình' },
];

/** The tests write `@Name`; the box hands the hook a tag chip per picked person, so each known name becomes a chip. */
function cmd(text: string): Segment[] {
  const segments: Segment[] = [];
  let rest = text;
  while (rest.length > 0) {
    const at = rest.indexOf('@');
    const person = at < 0 ? undefined : PEOPLE.find((candidate) => rest.slice(at + 1).startsWith(candidate.name));
    if (at < 0) {
      segments.push({ kind: 'text', text: rest });
      break;
    }
    if (person === undefined) {
      // An unknown name stays plain text, as a name typed without being picked does.
      segments.push({ kind: 'text', text: rest.slice(0, at + 1) });
      rest = rest.slice(at + 1);
      continue;
    }
    if (at > 0) segments.push({ kind: 'text', text: rest.slice(0, at) });
    segments.push({ kind: 'mention', userId: person.id, name: person.name });
    rest = rest.slice(at + 1 + person.name.length);
  }
  return segments;
}

const schema = parseRecordSchema(badminton) as RecordSchema;

function resultData(overrides: Partial<SessionResultData> = {}): SessionResultData {
  return {
    schema,
    access: { visible: true, canEdit: true, windowClosed: false },
    records: [{ id: 7, data: {}, createdBy: 'u-bao', createdAt: '', updatedBy: null, updatedAt: '' }],
    isLoading: false,
    isError: false,
    isForbidden: false,
    names: new Map([
      ['u-bao', { name: 'Bao', avatarUrl: null }],
      ['u-an', { name: 'An', avatarUrl: null }],
      ['u-binh', { name: 'Bình', avatarUrl: null }],
    ]),
    playerIds: ['u-bao', 'u-an', 'u-binh'],
    locale: 'en',
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function reply(data: Partial<RecordChangeSetResponse>) {
  return {
    data: { success: true, message: '', data: { results: [], records: [], ...data }, timestamp: '' },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('useRecordCommands', () => {
  it('is unavailable to someone who cannot edit, on a hidden section, or without a schema', () => {
    const cannotEdit = renderHook(
      () => useRecordCommands(9, resultData({ access: { visible: true, canEdit: false, windowClosed: false } })),
      { wrapper },
    );
    expect(cannotEdit.result.current).toBeUndefined();
    const hidden = renderHook(() => useRecordCommands(9, resultData({ access: { visible: false } })), { wrapper });
    expect(hidden.result.current).toBeUndefined();
    const noSchema = renderHook(() => useRecordCommands(9, resultData({ schema: null })), { wrapper });
    expect(noSchema.result.current).toBeUndefined();
    const closed = renderHook(() => useRecordCommands(null, resultData()), { wrapper });
    expect(closed.result.current).toBeUndefined();
  });

  it('offers the three hints and the JOINED players', () => {
    const { result } = renderHook(() => useRecordCommands(9, resultData()), { wrapper });
    expect(result.current?.hints.map((hint) => hint.command)).toEqual(['add', 'upd', 'del']);
    expect(result.current?.mentions.map((mention) => mention.token)).toEqual(['Bao', 'An', 'Bình']);
  });

  it('leaves a text that is not a command to the caller, and sends nothing', () => {
    const post = vi.spyOn(apiClient, 'post');
    const { result } = renderHook(() => useRecordCommands(9, resultData()), { wrapper });
    let outcome: ReturnType<NonNullable<typeof result.current>['run']> | undefined;
    act(() => {
      outcome = result.current?.run(cmd('see you at 7'));
    });
    expect(outcome).toEqual({ handled: false, accepted: false });
    expect(post).not.toHaveBeenCalled();
    expect(result.current?.notices).toEqual([]);
  });

  it('refuses an invalid command with a caller-only notice and sends nothing', () => {
    const post = vi.spyOn(apiClient, 'post');
    const { result } = renderHook(() => useRecordCommands(9, resultData()), { wrapper });
    let outcome: ReturnType<NonNullable<typeof result.current>['run']> | undefined;
    act(() => {
      outcome = result.current?.run(cmd(':add @Zed 21 vs 15 @An'));
    });
    expect(outcome).toEqual({ handled: true, accepted: false });
    expect(post).not.toHaveBeenCalled();
    expect(result.current?.notices).toHaveLength(1);
    expect(result.current?.notices[0].text).toBe(
      'Side 1: “Zed” isn\'t a player in this session. Pick one from the @ list.',
    );
  });

  it('refuses :del for an id the session does not hold', () => {
    const { result } = renderHook(() => useRecordCommands(9, resultData()), { wrapper });
    act(() => {
      result.current?.run(cmd(':del 99'));
    });
    expect(result.current?.notices[0].text).toBe('There is no game with id 99.');
  });

  it('sends a valid :add as the same change set the dialog builds, and shows nothing on success', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue(reply({}));
    const { result } = renderHook(() => useRecordCommands(9, resultData()), { wrapper });
    let outcome: ReturnType<NonNullable<typeof result.current>['run']> | undefined;
    act(() => {
      outcome = result.current?.run(cmd(':add @Bao 15 vs 21 @An'));
    });
    expect(outcome).toEqual({ handled: true, accepted: true });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [url, body] = post.mock.calls[0];
    expect(url).toBe('/sessions/9/records/changes');
    // winner first: the team typed on the right swapped to the front, with its score
    expect(body).toEqual({
      add: [
        {
          clientRef: expect.any(String),
          playerIds: ['u-an', 'u-bao'],
          data: {
            teams: [
              { players: ['u-an'], scores: [21] },
              { players: ['u-bao'], scores: [15] },
            ],
          },
        },
      ],
      update: [],
      delete: [],
    });
    await waitFor(() => expect(result.current?.isRunning).toBe(false));
    expect(result.current?.notices).toEqual([]);
  });

  it('sends :upd and :del for an existing record id', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue(reply({}));
    const { result } = renderHook(() => useRecordCommands(9, resultData()), { wrapper });
    act(() => {
      result.current?.run(cmd(':upd 7 @Bao 21 vs 15 @An'));
    });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][1]).toMatchObject({
      add: [],
      update: [{ id: 7, playerIds: ['u-bao', 'u-an'] }],
      delete: [],
    });
    await waitFor(() => expect(result.current?.isRunning).toBe(false));
    act(() => {
      result.current?.run(cmd(':del 7'));
    });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[1][1]).toEqual({ add: [], update: [], delete: [7] });
  });

  it('turns a REJECTED operation into a notice with the server code\'s copy', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue(
      reply({
        results: [
          {
            clientRef: 'x',
            requestedId: null,
            id: null,
            status: 'REJECTED',
            errorCode: 'SESSION_RECORD_PLAYER_NOT_JOINED',
            errorParams: null,
          },
        ],
      }),
    );
    const { result } = renderHook(() => useRecordCommands(9, resultData()), { wrapper });
    act(() => {
      result.current?.run(cmd(':add @Bao 21 vs 15 @An'));
    });
    await waitFor(() => expect(result.current?.notices).toHaveLength(1));
    expect(result.current?.notices[0].text).toBe("A player in this result hasn't joined the session.");
  });

  it('turns a failed request into a notice', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useRecordCommands(9, resultData()), { wrapper });
    act(() => {
      result.current?.run(cmd(':add @Bao 21 vs 15 @An'));
    });
    await waitFor(() => expect(result.current?.notices).toHaveLength(1));
    expect(result.current?.notices[0].text).toBe("Couldn't save the results. Try again.");
  });

  it(`keeps the ${MAX_NOTICES} newest notices, newest first, and drops them when the session changes`, () => {
    const { result, rerender } = renderHook(({ id }) => useRecordCommands(id, resultData()), {
      wrapper,
      initialProps: { id: 9 as number | null },
    });
    for (const id of [1, 2, 3, 4]) {
      act(() => {
        result.current?.run(cmd(`:del ${id + 100}`));
      });
    }
    expect(result.current?.notices.map((notice) => notice.text)).toEqual([
      'There is no game with id 104.',
      'There is no game with id 103.',
      'There is no game with id 102.',
    ]);
    rerender({ id: null });
    rerender({ id: 9 });
    expect(result.current?.notices).toEqual([]);
  });
});
