import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/app/authStore';
import { getCodedErrorMessage } from '@/shared/lib/codedErrorMessage';
import type { Segment } from '@/shared/lib/mentionMarkup';
import {
  commandNameOf,
  commandText,
  mentionPlayers,
  parseCommand,
  type MentionPlayer,
} from '../recordCommand';
import { buildCommandHints, type CommandHint } from '../recordCommandHints';
import type { RecordChangeSetRequest } from '../resultTypes';
import type { SessionResultData } from './useSessionResultData';
import { useApplyRecordChanges } from './useApplyRecordChanges';

/** How many notices stay on screen: the newest first, older ones drop off. */
export const MAX_NOTICES = 3;

/** A line shown in the comment section to the caller only (never stored, never sent to the other participants). */
export interface RecordCommandNotice {
  id: number;
  text: string;
  /** The generic "your update is invalid" line (a streak of refusals shows as one line with a count). */
  invalid?: boolean;
}

/** A player the `@` list offers: the name the list shows plus the avatar it draws; the caller is marked (the list adds `(you)`). */
export interface MentionOption extends MentionPlayer {
  avatarUrl: string | null;
  isCurrentUser: boolean;
}

export interface RecordCommandsData {
  hints: CommandHint[];
  mentions: MentionOption[];
  /**
   * `handled: false` = not a record command, the caller posts it as a normal comment. Otherwise the command was
   * either refused locally (`accepted: false`, a notice says why, the text should stay in the box) or sent
   * (`accepted: true`, the box clears; a failure shows up as a notice later).
   */
  run: (draft: Segment[]) => { handled: boolean; accepted: boolean };
  isRunning: boolean;
  notices: RecordCommandNotice[];
}

/**
 * CLIENT-GL-39: record commands typed in the session thread (`:add`, `:upd`, `:del`). Available only to someone who
 * can log results (JOINED, inside the 24-hour window) on a sport with a supported record schema; for anyone else the
 * text is a normal comment. A command is validated with the record dialog's own checks and sent as the same one-item
 * change set; nothing is posted to the thread. Errors, local or from the server, become notices visible to the caller
 * only; a successful command shows nothing (the Result section refreshes from the response).
 */
export function useRecordCommands(
  sessionId: number | null,
  result: SessionResultData,
): RecordCommandsData | undefined {
  const { t } = useTranslation('session');
  const { t: tErrors } = useTranslation('errors');
  const mutation = useApplyRecordChanges();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const [notices, setNotices] = useState<RecordCommandNotice[]>([]);
  // How many commands in a row were refused as invalid (a command that goes through starts the count again).
  const [invalidStreak, setInvalidStreak] = useState(0);
  const [noticesFor, setNoticesFor] = useState(sessionId);
  const counter = useRef(0);
  // The notices belong to one opening of one session: a different session, or the modal closing, drops them.
  if (noticesFor !== sessionId) {
    setNoticesFor(sessionId);
    setNotices([]);
    setInvalidStreak(0);
  }

  const { schema, access, names, playerIds, records } = result;
  const available = sessionId !== null && schema !== null && access.visible && access.canEdit;

  const players = useMemo(
    () =>
      mentionPlayers(
        playerIds.flatMap((id) => {
          const name = names.get(id)?.name;
          return name === undefined || name === '' ? [] : [{ id, name }];
        }),
      ),
    [playerIds, names],
  );
  // The caller, when a player, is always first.
  const mentions = useMemo<MentionOption[]>(() => {
    const options = players.map((player) => ({
      ...player,
      avatarUrl: names.get(player.id)?.avatarUrl ?? null,
      isCurrentUser: player.id === currentUserId,
    }));
    return [...options.filter((option) => option.isCurrentUser), ...options.filter((option) => !option.isCurrentUser)];
  }, [players, names, currentUserId]);
  const hints = useMemo(
    () =>
      schema === null
        ? []
        : buildCommandHints(schema, {
            player: t('comments.command.labels.player'),
            score: t('comments.command.labels.score'),
            id: t('comments.command.labels.id'),
          }),
    [schema, t],
  );

  const push = useCallback((text: string) => {
    counter.current += 1;
    const id = counter.current;
    setNotices((previous) => [{ id, text }, ...previous].slice(0, MAX_NOTICES));
  }, []);

  // The newest line of a streak of refusals is replaced, not stacked: the count after it says how many in a row.
  const pushInvalid = useCallback(
    (count: number) => {
      counter.current += 1;
      const id = counter.current;
      const text = count < 2 ? t('comments.command.invalid') : t('comments.command.invalidRepeated', { count });
      setNotices((previous) => {
        const rest = previous.filter((notice) => !notice.invalid);
        return [{ id, text, invalid: true }, ...rest].slice(0, MAX_NOTICES);
      });
    },
    [t],
  );

  const run = useCallback(
    (draft: Segment[]) => {
      // The players are read from the chips' ids (CLIENT-GL-50); a name typed without being picked is no player.
      const text = commandText(draft);
      if (!available || schema === null || commandNameOf(text) === null) {
        return { handled: false, accepted: false };
      }
      const parsed = parseCommand(text, { schema, players, records: records ?? [] });
      if (!parsed.ok) {
        // Whatever is wrong, one line: the hint under the box already shows the shape of a command.
        pushInvalid(invalidStreak + 1);
        setInvalidStreak(invalidStreak + 1);
        return { handled: true, accepted: false };
      }
      setInvalidStreak(0);
      const { operation } = parsed;
      const changes: RecordChangeSetRequest = {
        add:
          operation.kind === 'add'
            ? [{ clientRef: crypto.randomUUID(), playerIds: operation.playerIds, data: operation.data }]
            : [],
        update:
          operation.kind === 'upd'
            ? [{ id: operation.id, playerIds: operation.playerIds, data: operation.data }]
            : [],
        delete: operation.kind === 'del' ? [operation.id] : [],
      };
      mutation.mutate(
        { sessionId: sessionId as number, changes },
        {
          onSuccess: (response) => {
            for (const outcome of response.results) {
              if (outcome.status !== 'REJECTED') continue;
              push(
                tErrors(`codes.${outcome.errorCode ?? 'SESSION_RECORD_INVALID'}`, {
                  ...(outcome.errorParams ?? {}),
                  defaultValue: tErrors('codes.SESSION_RECORD_INVALID'),
                }),
              );
            }
          },
          onError: (error) => push(getCodedErrorMessage(error) ?? t('result.dialog.saveError')),
        },
      );
      return { handled: true, accepted: true };
    },
    [available, schema, players, records, push, pushInvalid, invalidStreak, mutation, sessionId, tErrors, t],
  );

  if (!available) return undefined;
  return { hints, mentions, run, isRunning: mutation.isPending, notices };
}
