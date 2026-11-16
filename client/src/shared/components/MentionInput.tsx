import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { cn } from '@/shared/lib/utils';
import { initialsFor } from '@/shared/lib/initialsFor';
import {
  clipSegments,
  mergeSegments,
  plainText,
  serialize,
  storedLength,
  type Segment,
} from '@/shared/lib/mentionMarkup';
import { resolvePaste, type PastePerson } from '@/shared/lib/resolvePaste';

/** A person the `@` list offers. `label` is what the row shows (it tells two same-name people apart); the chip shows `name`. */
export interface MentionOptionItem {
  id: string;
  name: string;
  label: string;
  avatarUrl: string | null;
}

/** What a caller hands a box to offer tags: the people for the `@` word (already filtered) and a way to hear what is typed. */
export interface MentionSource {
  options: MentionOptionItem[];
  onQueryChange: (query: string | null) => void;
}

/** What the box holds: the pieces, the text that would be stored (tags as `@[Name](id)`) and the text a reader sees. */
export interface MentionDraft {
  segments: Segment[];
  stored: string;
  plain: string;
}

export interface MentionInputHandle {
  clear: () => void;
  focus: () => void;
  /** Replaces the whole content (a hint that starts a command) and puts the caret at the end. */
  setSegments: (segments: Segment[]) => void;
}

interface MentionInputProps {
  ariaLabel: string;
  placeholder: string;
  /** The limit counts what would be stored, tags included. */
  maxLength: number;
  /** The people to list for the `@` word at the caret (already filtered; the box only draws them). */
  options: MentionOptionItem[];
  pickerLabel: string;
  /** The `@` word at the caret changed (`null` = none): the owner uses it to search. */
  onQueryChange?: (query: string | null) => void;
  onChange: (draft: MentionDraft) => void;
  /** Enter outside the list. */
  onSubmit: () => void;
  /**
   * Record commands (CLIENT-GL-50): when the text starts with `:` a pasted `@name` becomes a tag chip for one of
   * these people (see `resolvePaste`). Without it, or in any other text, pasted text stays exactly as pasted.
   */
  pasteResolvePeople?: PastePerson[];
  onBlur?: () => void;
  /** Puts the caret in the box when it appears (the reply box). */
  focusOnMount?: boolean;
  className?: string;
}

interface ActiveMention {
  node: Text;
  /** Index of the `@` in the text node. */
  at: number;
  /** The caret's index in the text node. */
  end: number;
  query: string;
}

const MAX_QUERY_LENGTH = 40;
const COUNTER_FROM = 0.8;

function readNodes(parent: Node): Segment[] {
  const out: Segment[] = [];
  parent.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push({ kind: 'text', text: (node.textContent ?? '').replace(/\u00a0/g, ' ').replace(/\u200b/g, '') });
    } else if (node instanceof HTMLElement) {
      const userId = node.dataset.userId;
      if (userId !== undefined) out.push({ kind: 'mention', userId, name: node.dataset.name ?? '' });
      else if (node.tagName !== 'BR') out.push(...readNodes(node));
    }
  });
  return mergeSegments(out);
}

/**
 * CLIENT-GL-50: the comment box of the session thread. A `contenteditable` line where a person picked with `@` is a
 * chip: one unit that carries the person's id, deleted whole by Backspace and crossed by one arrow key. The box never
 * rewrites its text while the user types (an IME such as Vietnamese Telex is composing in it); it only reads it. It
 * rewrites it on a pick, a paste and a clear. The box shows only names; the id lives in the draft's `stored` text.
 *
 * The `@` list floats over what is below the box (absolute, not in a portal: a nested popover misbehaves inside the session modal), as wide as its longest name; arrows move,
 * Enter or Tab pick, Esc closes. Enter outside the list sends and never adds a line.
 */
export const MentionInput = forwardRef<MentionInputHandle, MentionInputProps>(function MentionInput(
  {
    ariaLabel,
    placeholder,
    maxLength,
    options,
    pickerLabel,
    onQueryChange,
    onChange,
    onSubmit,
    pasteResolvePeople,
    onBlur,
    focusOnMount = false,
    className,
  },
  ref,
) {
  const { t } = useTranslation('sharedComponents');
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [mention, setMention] = useState<ActiveMention | null>(null);
  const [closed, setClosed] = useState(false);
  const [active, setActive] = useState(0);
  const [length, setLength] = useState(0);
  const lastQuery = useRef<string | null>(null);

  const chip = useCallback(
    (userId: string, name: string): HTMLSpanElement => {
      const element = document.createElement('span');
      element.contentEditable = 'false';
      element.dataset.userId = userId;
      element.dataset.name = name;
      element.setAttribute('role', 'img');
      element.setAttribute('aria-label', t('mention.chipLabel', { name }));
      element.className = 'mx-0.5 inline-block rounded-md bg-surface-2 px-1 font-medium text-text-accent';
      element.textContent = `@${name}`;
      return element;
    },
    [t],
  );

  const nodesFor = useCallback(
    (segments: Segment[]): Node[] =>
      segments.map((segment) =>
        segment.kind === 'text' ? document.createTextNode(segment.text) : chip(segment.userId, segment.name),
      ),
    [chip],
  );

  const activeMention = useCallback((): ActiveMention | null => {
    const root = rootRef.current;
    const selection = window.getSelection();
    if (root === null || selection === null || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!range.collapsed || !root.contains(range.startContainer)) return null;
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return null;
    const before = (node as Text).data.slice(0, range.startOffset);
    const at = before.lastIndexOf('@');
    if (at < 0) return null;
    if (at > 0 && !/\s/.test(before[at - 1])) return null;
    const query = before.slice(at + 1);
    if (query.length > MAX_QUERY_LENGTH) return null;
    return { node: node as Text, at, end: range.startOffset, query };
  }, []);

  const updateQuery = useCallback(() => {
    const next = activeMention();
    setMention(next);
    const query = next === null ? null : next.query;
    if (lastQuery.current !== query) {
      lastQuery.current = query;
      onQueryChange?.(query);
    }
  }, [activeMention, onQueryChange]);

  const caretAfter = (node: Node, offset?: number) => {
    const selection = window.getSelection();
    if (selection === null) return;
    const range = document.createRange();
    if (offset !== undefined) range.setStart(node, offset);
    else if (node.nodeType === Node.TEXT_NODE) range.setStart(node, (node as Text).data.length);
    else range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const readDraft = useCallback((): MentionDraft => {
    const root = rootRef.current;
    const segments = root === null ? [] : readNodes(root);
    if (root !== null && segments.length === 0 && root.childNodes.length > 0) root.replaceChildren();
    return { segments, stored: serialize(segments), plain: plainText(segments) };
  }, []);

  const emit = useCallback(() => {
    let draft = readDraft();
    const root = rootRef.current;
    if (root !== null && draft.stored.length > maxLength) {
      // Over the limit (a composition ended past it): cut the end, put the caret there.
      const fitted = clipSegments(draft.segments, maxLength);
      root.replaceChildren(...nodesFor(fitted));
      if (root.lastChild !== null) caretAfter(root.lastChild);
      draft = readDraft();
    }
    setLength(draft.stored.length);
    onChange(draft);
    return draft;
  }, [maxLength, nodesFor, onChange, readDraft]);

  useImperativeHandle(
    ref,
    () => ({
      clear: () => {
        rootRef.current?.replaceChildren();
        emit();
        updateQuery();
      },
      focus: () => rootRef.current?.focus(),
      setSegments: (segments) => {
        const root = rootRef.current;
        if (root === null) return;
        root.replaceChildren(...nodesFor(segments));
        root.focus();
        if (root.lastChild !== null) caretAfter(root.lastChild);
        else caretAfter(root, 0);
        emit();
        updateQuery();
      },
    }),
    [emit, nodesFor, updateQuery],
  );

  useEffect(() => {
    if (focusOnMount) rootRef.current?.focus();
  }, [focusOnMount]);

  // A text that would pass the limit is refused before it is typed (not while an IME is composing).
  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return;
    const block = (event: Event) => {
      const input = event as InputEvent;
      if (input.isComposing || input.inputType !== 'insertText' || input.data === null) return;
      const selection = window.getSelection();
      if (selection === null || !selection.isCollapsed) return;
      if (storedLength(readNodes(root)) + input.data.length > maxLength) input.preventDefault();
    };
    root.addEventListener('beforeinput', block);
    return () => root.removeEventListener('beforeinput', block);
  }, [maxLength]);

  // The caret moved by mouse or keys: the `@` word it is in may have changed.
  useEffect(() => {
    const onSelection = () => {
      const root = rootRef.current;
      if (root !== null && root.contains(window.getSelection()?.anchorNode ?? null)) updateQuery();
    };
    document.addEventListener('selectionchange', onSelection);
    return () => document.removeEventListener('selectionchange', onSelection);
  }, [updateQuery]);

  const listed = mention !== null && !closed ? options : [];
  const activeIndex = Math.min(active, Math.max(listed.length - 1, 0));
  const open = listed.length > 0;

  const pick = (person: MentionOptionItem) => {
    const root = rootRef.current;
    const current = activeMention();
    if (root === null || current === null) return;
    const { node, at, end } = current;
    const mentionSegment: Segment = { kind: 'mention', userId: person.id, name: person.name };
    const total = storedLength(readNodes(root));
    if (total - (end - at) + storedLength([mentionSegment]) + 1 > maxLength) return;
    const before = node.data.slice(0, at);
    const space = document.createTextNode(` ${node.data.slice(end).replace(/^ /, '')}`);
    const parent = node.parentNode;
    if (parent === null) return;
    if (before !== '') parent.insertBefore(document.createTextNode(before), node);
    parent.insertBefore(chip(person.id, person.name), node);
    parent.insertBefore(space, node);
    parent.removeChild(node);
    root.focus();
    caretAfter(space, 1);
    setActive(0);
    emit();
    updateQuery();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActive((activeIndex + step + listed.length) % listed.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        pick(listed[activeIndex]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setClosed(true);
        return;
      }
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      onSubmit();
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const root = rootRef.current;
    if (root === null) return;
    const raw = event.clipboardData.getData('text/plain').replace(/\s*[\r\n]+\s*/g, ' ');
    if (raw === '') return;
    const selection = window.getSelection();
    if (selection === null) return;
    if (selection.rangeCount === 0 || !root.contains(selection.getRangeAt(0).startContainer)) {
      root.focus();
      caretAfter(root, root.childNodes.length);
    }
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const head = document.createRange();
    head.selectNodeContents(root);
    head.setEnd(range.startContainer, range.startOffset);
    const textBefore = plainText(readNodes(head.cloneContents()));
    const resolving = pasteResolvePeople !== undefined && (textBefore + raw).startsWith(':');
    const pasted: Segment[] =
      resolving && pasteResolvePeople !== undefined
        ? resolvePaste(raw, pasteResolvePeople).segments
        : [{ kind: 'text', text: raw }];
    const room = maxLength - storedLength(readNodes(root));
    const nodes = nodesFor(clipSegments(pasted, Math.max(room, 0)));
    if (nodes.length > 0) {
      const fragment = document.createDocumentFragment();
      nodes.forEach((node) => fragment.appendChild(node));
      const last = nodes[nodes.length - 1];
      range.insertNode(fragment);
      caretAfter(last);
      // Neighbouring text pieces become one; a live selection follows the merge.
      root.normalize();
    }
    setActive(0);
    setClosed(false);
    emit();
    updateQuery();
  };

  const onCopyOrCut = (event: ClipboardEvent<HTMLDivElement>, cut: boolean) => {
    const root = rootRef.current;
    const selection = window.getSelection();
    if (root === null || selection === null || selection.rangeCount === 0 || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return;
    event.preventDefault();
    event.clipboardData.setData('text/plain', plainText(readNodes(range.cloneContents())));
    if (cut) {
      range.deleteContents();
      emit();
      updateQuery();
    }
  };

  return (
    <div className={cn('relative flex min-w-0 flex-1 flex-col gap-1', className)}>
      <div
        ref={rootRef}
        role="textbox"
        contentEditable
        tabIndex={0}
        suppressContentEditableWarning
        aria-label={ariaLabel}
        aria-multiline="false"
        aria-autocomplete="list"
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined}
        data-placeholder={placeholder}
        spellCheck={false}
        onInput={() => {
          setClosed(false);
          setActive(0);
          emit();
          updateQuery();
        }}
        onKeyDown={onKeyDown}
        onKeyUp={updateQuery}
        onClick={updateQuery}
        onFocus={() => {
          setClosed(false);
          updateQuery();
        }}
        onBlur={() => {
          setClosed(true);
          onBlur?.();
        }}
        onPaste={onPaste}
        onCopy={(event) => onCopyOrCut(event, false)}
        onCut={(event) => onCopyOrCut(event, true)}
        className="min-h-9 w-full cursor-text overflow-hidden rounded-lg border-hairline border-border bg-surface-1 px-3 py-1.5 text-2sm break-words whitespace-pre-wrap text-text-primary empty:before:text-text-muted empty:before:content-[attr(data-placeholder)] focus-visible:ring-2 focus-visible:ring-border-accent focus-visible:outline-none"
      />
      {length >= maxLength * COUNTER_FROM && (
        <p className="self-end text-2xs text-text-muted" aria-live="polite">
          {t('mention.lengthCounter', { count: length, max: maxLength })}
        </p>
      )}
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={pickerLabel}
          // Keep focus in the box while the pointer is on the list.
          onMouseDown={(event) => event.preventDefault()}
          className="absolute top-full left-0 z-20 mt-1 flex max-h-40 w-max max-w-72 min-w-32 flex-col overflow-y-auto rounded-md border-hairline border-border-strong bg-surface-2 py-0.5 shadow-md"
        >
          {listed.map((person, index) => (
            <li key={person.id} role="presentation">
              <button
                type="button"
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                tabIndex={-1}
                onClick={() => pick(person)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-1.5 px-2 py-1.5 text-left text-2xs text-text-primary hover:bg-surface-1',
                  index === activeIndex && 'bg-surface-1',
                )}
              >
                <Avatar className="size-4 shrink-0" aria-hidden="true">
                  {person.avatarUrl !== null && <AvatarImage src={person.avatarUrl} alt="" />}
                  <AvatarFallback className="text-[8px]">{initialsFor(person.name)}</AvatarFallback>
                </Avatar>
                <span className="truncate">{person.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
