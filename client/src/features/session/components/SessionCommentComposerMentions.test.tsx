import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MentionOptionItem, MentionSource } from '@/shared/components/MentionInput';
import type { MentionOption } from '../hooks/useRecordCommands';
import { SessionCommentComposer, type ComposerCommands } from './SessionCommentComposer';

// CLIENT-GL-50: the chip composer: tagging in a normal comment, pasted text, the length limit.
// jsdom has no real caret or Backspace over a non-editable chip: those are proven in the Playwright flow
// (`session-thread-tags.spec.ts`).

const PRIYA = '123e4567-e89b-12d3-a456-426614174000';
const people: MentionOptionItem[] = [
  { id: PRIYA, name: 'Priya Shah', label: 'Priya Shah', avatarUrl: null },
  { id: 'u-tuan', name: 'Tuấn Anh', label: 'Tuấn Anh', avatarUrl: null },
];

const mentions: MentionOption[] = [
  { id: 'u-bao', token: 'Bao', name: 'Bao', avatarUrl: null },
  { id: 'u-an', token: 'An', name: 'An', avatarUrl: null },
];

/** The names a list shows (the avatar's initials are not part of the name). */
function shown(list: HTMLElement): string[] {
  return within(list)
    .getAllByRole('option')
    .map((option) => option.querySelector('span.truncate')?.textContent ?? '');
}

function setup(options: { source?: MentionSource | null; commands?: boolean } = {}) {
  const user = userEvent.setup();
  const onAddComment = vi.fn();
  const source: MentionSource | undefined =
    options.source === null ? undefined : (options.source ?? { options: people, onQueryChange: vi.fn() });
  const commands: ComposerCommands | undefined = options.commands
    ? {
        hints: [{ command: 'add', template: ':add @player1 vs @player1' }],
        mentions,
        run: vi.fn(() => ({ handled: true, accepted: true })),
        isRunning: false,
      }
    : undefined;
  render(
    <SessionCommentComposer
      currentUser={{ fullName: 'Jordan Lee', avatarUrl: null }}
      onAddComment={onAddComment}
      isPosting={false}
      commands={commands}
      mentionSource={source}
    />,
  );
  const input = screen.getByRole('textbox', { name: 'Add a comment' });
  return { user, input, onAddComment, source, commands };
}

describe('SessionCommentComposer tagging', () => {
  it('offers the thread people for an @ word, asks the source for what was typed, and shows no id', async () => {
    const { user, input, source } = setup();
    await user.type(input, 'hi @Pr');
    const list = screen.getByRole('listbox', { name: 'People you can tag' });
    expect(shown(list)).toEqual(['Priya Shah', 'Tuấn Anh']);
    expect(source?.onQueryChange).toHaveBeenLastCalledWith('Pr');
    expect(document.body.textContent).not.toContain(PRIYA);
  });

  it('picks with Enter into a chip that shows the name, then posts the comment with the id markup', async () => {
    const { user, input, onAddComment } = setup();
    await user.type(input, 'hi @Pr{Enter}');
    expect(onAddComment).not.toHaveBeenCalled();
    expect(screen.getByRole('img', { name: 'Mention: Priya Shah' })).toHaveTextContent('@Priya Shah');
    // The box shows the name only.
    expect(input.textContent).toBe('hi @Priya Shah ');

    await user.type(input, 'see you{Enter}');
    expect(onAddComment).toHaveBeenCalledWith(`hi @[Priya Shah](${PRIYA}) see you`);
    expect(input).toBeEmptyDOMElement();
  });

  it('copies a chip as the plain @Full Name, never the id or the markup', async () => {
    const { user, input } = setup();
    await user.type(input, 'hi @Pr{Enter}');
    window.getSelection()?.selectAllChildren(input);
    const data = { setData: vi.fn() };
    fireEvent.copy(input, { clipboardData: data });
    expect(data.setData).toHaveBeenCalledWith('text/plain', 'hi @Priya Shah ');
    expect(JSON.stringify(data.setData.mock.calls)).not.toContain(PRIYA);
  });

  it('does not offer a person who is already tagged in the same comment', async () => {
    const { user, input } = setup();
    await user.type(input, '@Pr{Enter}');
    await user.type(input, '@');
    const list = screen.getByRole('listbox', { name: 'People you can tag' });
    expect(shown(list)).toEqual(['Tuấn Anh']);
  });

  it('keeps working when the people could not be loaded: no list, the comment still posts', async () => {
    const { user, input, onAddComment } = setup({ source: { options: [], onQueryChange: vi.fn() } });
    await user.type(input, 'hi @Zed{Enter}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onAddComment).toHaveBeenCalledWith('hi @Zed');
  });

  it('does not open the list in the middle of a word, or without a source', async () => {
    const withSource = setup();
    await withSource.user.type(withSource.input, 'mail a@b');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('posts a comment with no source as plain text', async () => {
    const { user, input, onAddComment } = setup({ source: null });
    await user.type(input, 'see you @Pr{Enter}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onAddComment).toHaveBeenCalledWith('see you @Pr');
  });

  it('keeps pasted text exactly as pasted in a normal comment: nothing is turned into a chip', async () => {
    const { user, input } = setup();
    await user.click(input);
    await user.paste('look @Priya Shah and @Tuấn Anh ');
    expect(screen.queryByRole('img')).toBeNull();
    expect(input.textContent).toBe('look @Priya Shah and @Tuấn Anh ');
  });

  it('shows how much of the limit is used once past 80%, counting the stored text', async () => {
    const { user, input } = setup();
    await user.click(input);
    await user.paste('a'.repeat(700));
    expect(screen.queryByText(/ \/ 1000/)).toBeNull();
    await user.paste('a'.repeat(150));
    expect(screen.getByText('850 / 1000')).toBeInTheDocument();
  });

  it('counts a tag as the markup that would be stored and refuses a pick that would pass the limit', async () => {
    const { user, input, onAddComment } = setup();
    await user.click(input);
    await user.paste('a'.repeat(960));
    // The typed @Pr still fits (964 characters), the tag's markup (51 characters) does not.
    await user.type(input, ' @Pr');
    expect(screen.getByRole('listbox', { name: 'People you can tag' })).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('img')).toBeNull();
    expect(onAddComment).not.toHaveBeenCalled();
  });

  it('refuses typing past the limit', async () => {
    const { user, input } = setup();
    await user.click(input);
    await user.paste('a'.repeat(850));
    await user.paste('b'.repeat(500));
    expect(screen.getByText('1000 / 1000')).toBeInTheDocument();
    await user.type(input, 'zzz');
    expect(input.textContent).not.toContain('z');
  });
});

describe('SessionCommentComposer pasted record commands', () => {
  it('turns each pasted @name of a command into a chip, leaves the last @word open for the picker', async () => {
    const { user, input, commands } = setup({ commands: true });
    await user.click(input);
    await user.paste(':add @Bao 21 vs 15 @An ');
    expect(screen.getByRole('img', { name: 'Mention: Bao' })).toBeInTheDocument();
    // The last @word keeps no trailing blank and opens the player list.
    expect(input.textContent).toBe(':add @Bao 21 vs 15 @An');
    const list = screen.getByRole('listbox', { name: 'Players' });
    expect(shown(list)).toEqual(['An']);
    await user.keyboard('{Enter}');
    expect(screen.getAllByRole('img').map((chip) => chip.getAttribute('aria-label'))).toEqual([
      'Mention: Bao',
      'Mention: An',
    ]);
    expect(commands?.run).not.toHaveBeenCalled();
  });

  it('leaves a pasted name nobody has as plain text, so the command is refused', async () => {
    const { user, input, commands } = setup({ commands: true });
    await user.click(input);
    await user.paste(':add @Zed 21 vs 15 @An 3 @Bao');
    expect(screen.getAllByRole('img').map((chip) => chip.getAttribute('aria-label'))).toEqual(['Mention: An']);
    expect(input.textContent).toContain('@Zed');
    expect(commands?.run).not.toHaveBeenCalled();
  });

  it('does not resolve a paste that is not a command', async () => {
    const { user, input } = setup({ commands: true });
    await user.click(input);
    await user.paste('with @Bao and @An');
    expect(screen.queryByRole('img')).toBeNull();
  });
});
