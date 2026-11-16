import { IconSend } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MAX_COMMENT_LENGTH } from '@/features/feed/types';
import { MentionInput, type MentionDraft, type MentionInputHandle, type MentionOptionItem, type MentionSource } from '@/shared/components/MentionInput';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { Button, POST_BUTTON_DISABLED_OVERRIDE } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import { initialsFor } from '@/shared/lib/initialsFor';
import { isEmptyDraft, serialize, trimSegments } from '@/shared/lib/mentionMarkup';
import { matchesName } from '@/shared/lib/nameMatch';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import type { RecordCommandsData } from '../hooks/useRecordCommands';
import { matchingHints } from '../recordCommandHints';

/** What the composer needs to understand record commands (CLIENT-GL-39); absent = every text is a normal comment. */
export type ComposerCommands = Pick<RecordCommandsData, 'hints' | 'mentions' | 'run' | 'isRunning'>;

interface SessionCommentComposerProps {
  /** i18next `"namespace:key.path"` prefix that overrides this component's copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
  currentUser: { fullName: string; avatarUrl: string | null } | undefined;
  onAddComment: (content: string) => void;
  isPosting: boolean;
  /** CLIENT-GL-39: record commands (`:add`, `:upd`, `:del`); only for someone who can log results. */
  commands?: ComposerCommands;
  /** CLIENT-GL-50: the people a normal comment can tag with `@` (everyone who can see the thread). */
  mentionSource?: MentionSource;
}

const EMPTY_DRAFT: MentionDraft = { segments: [], stored: '', plain: '' };

/**
 * CLIENT-SESSION-10: extracted from `SessionCommentSection` so `SessionDetailModal` can pin it in
 * the dialog's non-scrolling footer (design-reference-session-modal.html) while the like
 * button/thread/"view more" stay in the scrollable body — `SessionCommentSection` no longer owns
 * composer state. Same input/submit behavior as before (Enter submits, trims, clears on send).
 *
 * CLIENT-GL-39: with `commands`, a text that starts with exactly `:add`, `:upd` or `:del` is a record command: it is
 * handed to `commands.run` and never posted as a comment. While the text starts with `:`, the matching command
 * templates show under the box. An invalid command keeps its text so it can be fixed; a command that was sent clears
 * the box.
 *
 * CLIENT-GL-50: the box is a chip composer (`MentionInput`). A person picked with `@` is a chip that carries their id.
 * In a record command the list is the players who can be named (JOINED), filtered here; in a normal comment it is
 * `mentionSource` (everyone who can see the thread), and the comment is posted with each tag written as
 * `@[Full Name](userId)`. A command reads its players from the chips' ids.
 */
export function SessionCommentComposer({
  currentUser,
  onAddComment,
  isPosting,
  i18nOverridePrefix,
  commands,
  mentionSource,
}: SessionCommentComposerProps) {
  const t = useOverridableText('session', i18nOverridePrefix);
  const [draft, setDraft] = useState<MentionDraft>(EMPTY_DRAFT);
  const [query, setQuery] = useState<string | null>(null);
  const inputRef = useRef<MentionInputHandle>(null);

  const commandMode = commands !== undefined && draft.plain.startsWith(':');
  const hints = commands === undefined ? [] : matchingHints(draft.plain, commands.hints);

  // A normal comment searches the thread's people; a command filters its own list here and asks the server nothing.
  const onQueryChange = mentionSource?.onQueryChange;
  useEffect(() => {
    onQueryChange?.(commandMode ? null : query);
  }, [commandMode, query, onQueryChange]);
  useEffect(() => () => onQueryChange?.(null), [onQueryChange]);

  const options = useMemo<MentionOptionItem[]>(() => {
    if (query === null) return [];
    const tagged = new Set(draft.segments.flatMap((segment) => (segment.kind === 'mention' ? [segment.userId] : [])));
    if (commandMode && commands !== undefined) {
      return commands.mentions
        .filter((player) => !tagged.has(player.id) && matchesName(player.name, query))
        .map((player) => ({ id: player.id, name: player.name, label: player.token, avatarUrl: player.avatarUrl }));
    }
    return (mentionSource?.options ?? []).filter((person) => !tagged.has(person.id));
  }, [query, commandMode, commands, mentionSource, draft.segments]);

  const submitComment = () => {
    const segments = trimSegments(draft.segments);
    if (isEmptyDraft(segments)) return;
    const outcome = commands?.run(segments);
    if (outcome?.handled === true) {
      if (outcome.accepted) inputRef.current?.clear();
      return;
    }
    onAddComment(serialize(segments));
    inputRef.current?.clear();
  };

  const busy = isPosting || commands?.isRunning === true;
  const pasteResolvePeople = commands?.mentions.map((player) => ({ id: player.id, name: player.name }));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start gap-2">
        <Avatar className="mt-1 size-7 shrink-0">
          {currentUser?.avatarUrl != null && <AvatarImage src={currentUser.avatarUrl} alt="" />}
          <AvatarFallback className="bg-surface-1 text-2xs text-text-primary">
            {currentUser !== undefined ? initialsFor(currentUser.fullName) : ''}
          </AvatarFallback>
        </Avatar>
        <MentionInput
          ref={inputRef}
          ariaLabel={t('comments.addLabel')}
          placeholder={t('comments.placeholder')}
          maxLength={MAX_COMMENT_LENGTH}
          options={options}
          pickerLabel={commandMode ? t('comments.command.mentionLabel') : t('comments.tagLabel')}
          onQueryChange={setQuery}
          onChange={setDraft}
          onSubmit={submitComment}
          pasteResolvePeople={pasteResolvePeople}
        />
        <Button
          variant="primary"
          size="icon"
          aria-label={t('comments.post')}
          onClick={submitComment}
          disabled={isEmptyDraft(draft.segments) || busy}
          className={cn('cursor-pointer rounded-full disabled:cursor-default', POST_BUTTON_DISABLED_OVERRIDE)}
        >
          <IconSend className="size-4" aria-hidden="true" />
        </Button>
      </div>

      {hints.length > 0 && options.length === 0 && (
        <ul
          aria-label={t('comments.command.hintsLabel')}
          className="ml-9 flex flex-col gap-0.5 text-2xs text-text-secondary"
        >
          {hints.map((hint) => (
            <li key={hint.command}>
              <button
                type="button"
                onClick={() => inputRef.current?.setSegments([{ kind: 'text', text: `:${hint.command} ` }])}
                className="w-full cursor-pointer break-words rounded-md px-1.5 py-0.5 text-left font-mono hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
              >
                {hint.template}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
