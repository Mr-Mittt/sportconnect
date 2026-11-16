import { IconSend } from '@tabler/icons-react';
import { Fragment, useEffect, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent, type Ref } from 'react';
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
import { coveredHintParts, matchingHints, type CommandHint } from '../recordCommandHints';

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
  /** The caret goes into the box when it appears (the session modal opening). */
  focusOnOpen?: boolean;
  /** Lets the owner put the caret in the box (the modal's open-focus handler). */
  focusRef?: Ref<{ focus: () => void }>;
  /** Told whether the box holds text (the modal asks before closing over an unsent comment). */
  onDraftChange?: (key: string, hasDraft: boolean) => void;
}

const EMPTY_DRAFT: MentionDraft = { segments: [], stored: '', plain: '' };

/**
 * One command template, word by word: the words the typed text already covers are bold (the command word counts a typed
 * prefix), the rest stays as it is. A hint without parts (a bare template) is drawn plain.
 */
function HintText({ hint, covered }: { hint: CommandHint; covered: number[] }) {
  if (hint.parts.length === 0) return <>{hint.template}</>;
  return (
    <>
      {hint.parts.map((part, index) => {
        const bold = covered[index] ?? 0;
        return (
          <Fragment key={index}>
            {index > 0 && ' '}
            {bold > 0 && (
              <span className="font-semibold text-text-primary">{part.text.slice(0, bold)}</span>
            )}
            {part.text.slice(bold)}
          </Fragment>
        );
      })}
    </>
  );
}

/**
 * CLIENT-SESSION-10: extracted from `SessionCommentSection` so `SessionDetailModal` can pin it in
 * the dialog's non-scrolling footer (design-reference-session-modal.html) while the like
 * button/thread/"view more" stay in the scrollable body — `SessionCommentSection` no longer owns
 * composer state. Same input/submit behavior as before (Enter submits, trims, clears on send).
 *
 * CLIENT-GL-39: with `commands`, a text that starts with exactly `:add`, `:upd` or `:del` is a record command: it is
 * handed to `commands.run` and never posted as a comment. While the text starts with `:`, the matching command
 * templates show under the box, with what is typed already in bold; they are keyboard stops (Down from the box or Tab
 * reaches them, Up and Down move between them, Up from the first or Esc goes back to the box) and come before the Send
 * button in the tab order. An invalid command keeps its text so it can be fixed; a command that was sent clears the box.
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
  focusOnOpen = false,
  focusRef,
  onDraftChange,
}: SessionCommentComposerProps) {
  const t = useOverridableText('session', i18nOverridePrefix);
  const [draft, setDraft] = useState<MentionDraft>(EMPTY_DRAFT);
  const [query, setQuery] = useState<string | null>(null);
  const inputRef = useRef<MentionInputHandle>(null);
  const hintsRef = useRef<HTMLUListElement>(null);
  useImperativeHandle(focusRef, () => ({ focus: () => inputRef.current?.focus() }), []);

  const hasDraft = !isEmptyDraft(draft.segments);
  useEffect(() => {
    onDraftChange?.('comment', hasDraft);
  }, [onDraftChange, hasDraft]);
  useEffect(() => () => onDraftChange?.('comment', false), [onDraftChange]);

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
        .map((player) => ({
          id: player.id,
          name: player.name,
          label: player.isCurrentUser ? `${player.token} ${t('detail.qualifier.you')}` : player.token,
          avatarUrl: player.avatarUrl,
        }));
    }
    return (mentionSource?.options ?? []).filter((person) => !tagged.has(person.id));
  }, [query, commandMode, commands, mentionSource, draft.segments, t]);

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

  const hintsShown = hints.length > 0 && options.length === 0;
  const hintButtons = () => Array.from(hintsRef.current?.querySelectorAll('button') ?? []);

  // Down from the box (no `@` list open: that one handles the arrows itself) goes to the hints.
  const onBoxKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' || event.defaultPrevented || !hintsShown) return;
    event.preventDefault();
    hintButtons()[0]?.focus();
  };

  const onHintsKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const buttons = hintButtons();
    const at = buttons.findIndex((button) => button === document.activeElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      buttons[Math.min(at + 1, buttons.length - 1)]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (at <= 0) inputRef.current?.focus();
      else buttons[at - 1]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      inputRef.current?.focus();
    }
  };

  const busy = isPosting || commands?.isRunning === true;
  const pasteResolvePeople = commands?.mentions.map((player) => ({ id: player.id, name: player.name }));

  // A grid, not a row: in the DOM the hints come before the Send button (so Tab reaches them first) while they are
  // drawn under the box, on the second row.
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1.5">
      <Avatar className="col-start-1 row-start-1 mt-1 size-7 shrink-0">
        {currentUser?.avatarUrl != null && <AvatarImage src={currentUser.avatarUrl} alt="" />}
        <AvatarFallback className="bg-surface-1 text-2xs text-text-primary">
          {currentUser !== undefined ? initialsFor(currentUser.fullName) : ''}
        </AvatarFallback>
      </Avatar>
      <div role="presentation" className="col-start-2 row-start-1 flex min-w-0" onKeyDown={onBoxKeyDown}>
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
          focusOnMount={focusOnOpen}
        />
      </div>

      {hintsShown && (
        <div role="presentation" onKeyDown={onHintsKeyDown} className="col-span-2 col-start-2 row-start-2">
        <ul
          ref={hintsRef}
          aria-label={t('comments.command.hintsLabel')}
          className="flex flex-col gap-0.5 text-2xs text-text-secondary"
        >
          {hints.map((hint) => (
            <li key={hint.command}>
              <button
                type="button"
                onClick={() => inputRef.current?.setSegments([{ kind: 'text', text: `:${hint.command} ` }])}
                className="w-full cursor-pointer break-words rounded-md px-1.5 py-0.5 text-left font-mono hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
              >
                <HintText hint={hint} covered={coveredHintParts(hint, draft.segments)} />
              </button>
            </li>
          ))}
        </ul>
        </div>
      )}

      <Button
        variant="primary"
        size="icon"
        aria-label={t('comments.post')}
        onClick={submitComment}
        disabled={isEmptyDraft(draft.segments) || busy}
        className={cn(
          'col-start-3 row-start-1 cursor-pointer rounded-full disabled:cursor-default',
          POST_BUTTON_DISABLED_OVERRIDE,
        )}
      >
        <IconSend className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
