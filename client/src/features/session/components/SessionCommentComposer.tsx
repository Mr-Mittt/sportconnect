import { IconSend } from '@tabler/icons-react';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { MAX_COMMENT_LENGTH } from '@/features/feed/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { Button, POST_BUTTON_DISABLED_OVERRIDE } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import { initialsFor } from '@/shared/lib/initialsFor';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import type { MentionOption, RecordCommandsData } from '../hooks/useRecordCommands';
import {
  activeMention,
  insertMention,
  matchingHints,
  mentionOptions,
} from '../recordCommandHints';

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
}

/**
 * CLIENT-SESSION-10: extracted from `SessionCommentSection` so `SessionDetailModal` can pin it in
 * the dialog's non-scrolling footer (design-reference-session-modal.html) while the like
 * button/thread/"view more" stay in the scrollable body — `SessionCommentSection` no longer owns
 * composer state. Same input/submit behavior as before (Enter submits, trims, clears on send).
 *
 * CLIENT-GL-39: with `commands`, a text that starts with exactly `:add`, `:upd` or `:del` is a record command: it is
 * handed to `commands.run` and never posted as a comment. While the text starts with `:`, the matching command
 * templates show under the box, and a `@` word opens the player list (arrows move, Enter or Tab pick, Esc closes).
 * An invalid command keeps its text so it can be fixed; a command that was sent clears the box. The lists are drawn in
 * place, not in a portal: a nested popover misbehaves inside the session modal.
 */
export function SessionCommentComposer({
  currentUser,
  onAddComment,
  isPosting,
  i18nOverridePrefix,
  commands,
}: SessionCommentComposerProps) {
  const t = useOverridableText('session', i18nOverridePrefix);
  const [content, setContent] = useState('');
  const [caret, setCaret] = useState(0);
  const [mentionClosed, setMentionClosed] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const listId = useId();

  const hints = commands === undefined ? [] : matchingHints(content, commands.hints);
  const mention = commands === undefined ? null : activeMention(content, caret);
  const options: MentionOption[] =
    commands === undefined || mention === null || mentionClosed
      ? []
      : mentionOptions(content, mention, commands.mentions);
  // A name typed in full is done: the list closes so Enter sends instead of picking it again.
  const complete = mention !== null && options.some((option) => option.token.toLocaleLowerCase() === mention.query.toLocaleLowerCase());
  const mentionOpen = options.length > 0 && !complete;
  const activeIndex = Math.min(active, Math.max(options.length - 1, 0));

  // Put the caret after a picked player once React has rendered the new text.
  useLayoutEffect(() => {
    if (pendingCaret.current === null) return;
    const position = pendingCaret.current;
    pendingCaret.current = null;
    inputRef.current?.focus();
    inputRef.current?.setSelectionRange(position, position);
  });

  const submitComment = () => {
    const trimmed = content.trim();
    if (trimmed.length === 0) return;
    const outcome = commands?.run(trimmed);
    if (outcome?.handled === true) {
      if (outcome.accepted) setContent('');
      return;
    }
    onAddComment(trimmed);
    setContent('');
  };

  const pick = (player: MentionOption) => {
    if (mention === null) return;
    const next = insertMention(content, caret, mention, player);
    pendingCaret.current = next.caret;
    setContent(next.text.slice(0, MAX_COMMENT_LENGTH));
    setCaret(next.caret);
    setActive(0);
  };

  const commandHintStart = (command: string) => {
    const text = `${command} `;
    pendingCaret.current = text.length;
    setContent(text);
    setCaret(text.length);
  };

  const busy = isPosting || commands?.isRunning === true;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Avatar className="size-7 shrink-0">
          {currentUser?.avatarUrl != null && <AvatarImage src={currentUser.avatarUrl} alt="" />}
          <AvatarFallback className="bg-surface-1 text-2xs text-text-primary">
            {currentUser !== undefined ? initialsFor(currentUser.fullName) : ''}
          </AvatarFallback>
        </Avatar>
        <input
          ref={inputRef}
          type="text"
          value={content}
          onChange={(event) => {
            setContent(event.target.value.slice(0, MAX_COMMENT_LENGTH));
            setCaret(event.target.selectionStart ?? event.target.value.length);
            setMentionClosed(false);
            setActive(0);
          }}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? content.length)}
          onKeyDown={(event) => {
            if (mentionOpen) {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const step = event.key === 'ArrowDown' ? 1 : -1;
                setActive((activeIndex + step + options.length) % options.length);
                return;
              }
              if (event.key === 'Enter' || event.key === 'Tab') {
                event.preventDefault();
                pick(options[activeIndex]);
                return;
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setMentionClosed(true);
                return;
              }
            }
            if (event.key === 'Enter') submitComment();
          }}
          placeholder={t('comments.placeholder')}
          aria-label={t('comments.addLabel')}
          aria-autocomplete={commands === undefined ? undefined : 'list'}
          aria-controls={mentionOpen ? listId : undefined}
          aria-activedescendant={mentionOpen ? `${listId}-${activeIndex}` : undefined}
          maxLength={MAX_COMMENT_LENGTH}
          className="min-w-0 flex-1 rounded-lg border-hairline border-border bg-surface-1 px-3 py-1.5 text-2sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
        />
        <Button
          variant="primary"
          size="icon"
          aria-label={t('comments.post')}
          onClick={submitComment}
          disabled={content.trim().length === 0 || busy}
          className={cn('cursor-pointer rounded-full disabled:cursor-default', POST_BUTTON_DISABLED_OVERRIDE)}
        >
          <IconSend className="size-4" aria-hidden="true" />
        </Button>
      </div>

      {mentionOpen && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t('comments.command.mentionLabel')}
          // Keep focus in the input while the pointer is on the list.
          onMouseDown={(event) => event.preventDefault()}
          className="ml-9 flex max-h-40 flex-col overflow-y-auto rounded-md border-hairline border-border-strong bg-surface-2 py-0.5"
        >
          {options.map((player, index) => (
            <li key={player.id} role="presentation">
              <button
                type="button"
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                tabIndex={-1}
                onClick={() => pick(player)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-1.5 px-2 py-1.5 text-left text-2xs text-text-primary hover:bg-surface-1',
                  index === activeIndex && 'bg-surface-1',
                )}
              >
                <Avatar className="size-4 shrink-0" aria-hidden="true">
                  {player.avatarUrl !== null && <AvatarImage src={player.avatarUrl} alt="" />}
                  <AvatarFallback className="text-[8px]">{initialsFor(player.name)}</AvatarFallback>
                </Avatar>
                <span className="truncate">{player.token}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!mentionOpen && hints.length > 0 && (
        <ul
          aria-label={t('comments.command.hintsLabel')}
          className="ml-9 flex flex-col gap-0.5 text-2xs text-text-secondary"
        >
          {hints.map((hint) => (
            <li key={hint.command}>
              <button
                type="button"
                onClick={() => commandHintStart(`:${hint.command}`)}
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
