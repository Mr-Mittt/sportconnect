import { IconMoodSmile } from '@tabler/icons-react';
import EmojiPicker, { Theme, type EmojiClickData } from 'emoji-picker-react';
import type { RefObject } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';

export interface EmojiPickerButtonProps {
  /** The compose/edit textarea this button is attached to — used to insert
   * the picked emoji at the caret position rather than always appending to
   * the end. */
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  /** Called after inserting an emoji, alongside onChange — e.g. so the
   * caller's typing-indicator debounce (CHAT-15) treats an emoji pick the
   * same as a keystroke. */
  onInsert?: () => void;
  disabled?: boolean;
}

/**
 * Smile-face button that opens an emoji picker (CHAT-15) — sits inside the
 * compose box's own bottom-right corner (the caller positions it via a
 * `relative` wrapper around the textarea). Inserts at the current caret
 * position/selection, then restores focus and moves the caret just past the
 * inserted emoji, matching how a real text-input emoji picker behaves
 * elsewhere (Slack, Discord, Messenger) rather than only ever appending to
 * the end of the draft.
 */
export function EmojiPickerButton({
  textareaRef,
  value,
  onChange,
  onInsert,
  disabled,
}: EmojiPickerButtonProps) {
  const insertEmoji = (emoji: string) => {
    const node = textareaRef.current;
    const start = node?.selectionStart ?? value.length;
    const end = node?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + emoji + value.slice(end));
    onInsert?.();

    // Runs after this render commits the new value to the DOM — setting
    // selectionRange any earlier would be overwritten by React's own value
    // update.
    requestAnimationFrame(() => {
      if (!node) return;
      node.focus();
      const caret = start + emoji.length;
      node.setSelectionRange(caret, caret);
    });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label="Add emoji"
          title="Add emoji"
          className="cursor-pointer rounded p-0.5 text-text-muted hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent disabled:cursor-default disabled:opacity-60"
        >
          <IconMoodSmile className="size-4.5" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className="w-auto border-none bg-transparent p-0 shadow-none"
      >
        <EmojiPicker
          onEmojiClick={(data: EmojiClickData) => insertEmoji(data.emoji)}
          theme={Theme.AUTO}
          skinTonesDisabled
          width={300}
          height={360}
        />
      </PopoverContent>
    </Popover>
  );
}
