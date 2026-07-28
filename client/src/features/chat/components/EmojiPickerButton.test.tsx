import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState, type RefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { EmojiPickerButton } from './EmojiPickerButton';

// The real emoji-picker-react renders a huge grid (thousands of buttons) via
// a Radix Portal — not what this component's own logic needs proving, and
// slow/fragile to drive in jsdom. This fake stands in for it: one button
// that calls onEmojiClick with a fixed emoji, so these tests exercise
// EmojiPickerButton's own caret-aware insertion logic, not the third-party
// library's rendering (same "hand-rolled fake over a heavy real dependency"
// posture useChatConversation.test.tsx already uses for WebSocket).
vi.mock('emoji-picker-react', () => ({
  default: ({ onEmojiClick }: { onEmojiClick: (data: { emoji: string }) => void }) => (
    <button type="button" onClick={() => onEmojiClick({ emoji: '😀' })}>
      fake emoji
    </button>
  ),
  Theme: { AUTO: 'auto' },
}));

function ControlledHarness({
  initialValue,
  onInsert,
}: {
  initialValue: string;
  onInsert: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  return (
    <div>
      <textarea
        ref={textareaRef}
        aria-label="Draft"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <EmojiPickerButton
        textareaRef={textareaRef}
        value={value}
        onChange={setValue}
        onInsert={onInsert}
      />
    </div>
  );
}

describe('EmojiPickerButton', () => {
  it('shows a smile-face trigger with the label available on hover via title', () => {
    render(<ControlledHarness initialValue="" onInsert={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Add emoji' })).toHaveAttribute('title', 'Add emoji');
  });

  it('appends the picked emoji after whatever was actually typed, and calls onInsert', async () => {
    // Typed via userEvent (not seeded as a static prop) so the textarea's
    // real DOM selection state advances the same way it would for an actual
    // user — matching the app's real flow, where the compose draft can only
    // ever become non-empty by the user typing into this exact textarea.
    const onInsert = vi.fn();
    const user = userEvent.setup();
    render(<ControlledHarness initialValue="" onInsert={onInsert} />);

    await user.type(screen.getByLabelText('Draft'), 'hi');
    await user.click(screen.getByRole('button', { name: 'Add emoji' }));
    await user.click(await screen.findByText('fake emoji'));

    expect(screen.getByLabelText('Draft')).toHaveValue('hi😀');
    expect(onInsert).toHaveBeenCalledTimes(1);
  });

  it('inserts at the caret position rather than always appending to the end', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness initialValue="hi there" onInsert={vi.fn()} />);

    const textarea = screen.getByLabelText('Draft') as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(2, 2); // caret right after "hi"

    await user.click(screen.getByRole('button', { name: 'Add emoji' }));
    await user.click(await screen.findByText('fake emoji'));

    expect(textarea).toHaveValue('hi😀 there');
  });

  it('replaces a selection rather than inserting alongside it', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness initialValue="hi there" onInsert={vi.fn()} />);

    const textarea = screen.getByLabelText('Draft') as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(3, 8); // selects "there"

    await user.click(screen.getByRole('button', { name: 'Add emoji' }));
    await user.click(await screen.findByText('fake emoji'));

    expect(textarea).toHaveValue('hi 😀');
  });

  it('disables the trigger when disabled', () => {
    const ref: RefObject<HTMLTextAreaElement | null> = { current: null };
    render(<EmojiPickerButton textareaRef={ref} value="" onChange={vi.fn()} disabled />);
    expect(screen.getByRole('button', { name: 'Add emoji' })).toBeDisabled();
  });
});
