import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MentionOption } from '../hooks/useRecordCommands';
import { buildCommandHints } from '../recordCommandHints';
import badminton from '../recordSchema/badminton-record-schema-v1.json';
import { parseRecordSchema, type RecordSchema } from '../recordSchema';
import { SessionCommentComposer, type ComposerCommands } from './SessionCommentComposer';

// CLIENT-GL-39: record commands in the comment box.

const hints = [
  { command: 'add' as const, template: ':add @player1 [@player2] [score] vs [score] @player1 [@player2]', parts: [] },
  { command: 'upd' as const, template: ':upd <id> @player1 [@player2] [score] vs [score] @player1 [@player2]', parts: [] },
  { command: 'del' as const, template: ':del <id>', parts: [] },
];

const mentions: MentionOption[] = [
  { id: 'u-bao', token: 'Bao', name: 'Bao', avatarUrl: null, isCurrentUser: false },
  { id: 'u-an', token: 'An', name: 'An', avatarUrl: null, isCurrentUser: false },
  { id: 'u-anh', token: 'Anh Tuấn', name: 'Anh Tuấn', avatarUrl: null, isCurrentUser: false },
];

const realHints = buildCommandHints(parseRecordSchema(badminton) as RecordSchema, {
  player: 'player',
  score: 'score',
  id: 'id',
});

function setup(
  run: ComposerCommands['run'] = () => ({ handled: true, accepted: true }),
  players: MentionOption[] = mentions,
  commandHints: ComposerCommands['hints'] = hints,
) {
  const user = userEvent.setup();
  const onAddComment = vi.fn();
  const commands: ComposerCommands = { hints: commandHints, mentions: players, run: vi.fn(run), isRunning: false };
  render(
    <SessionCommentComposer
      currentUser={{ fullName: 'Jordan Lee', avatarUrl: null }}
      onAddComment={onAddComment}
      isPosting={false}
      commands={commands}
    />,
  );
  const input = screen.getByRole('textbox', { name: 'Add a comment' });
  return { user, input, onAddComment, run: commands.run as ReturnType<typeof vi.fn> };
}

describe('SessionCommentComposer record commands', () => {
  it('shows every command template for ":" and only the matching one as it is typed', async () => {
    const { user, input } = setup();
    await user.type(input, ':');
    const list = screen.getByRole('list', { name: 'Record commands' });
    expect(list.querySelectorAll('li')).toHaveLength(3);
    await user.type(input, 'a');
    expect(screen.getByRole('list', { name: 'Record commands' }).querySelectorAll('li')).toHaveLength(1);
    expect(screen.getByText(/^:add @player1/)).toBeInTheDocument();
    expect(screen.queryByText(/^:del/)).toBeNull();
  });

  it('shows no hints for a plain comment or without commands', async () => {
    const { user, input } = setup();
    await user.type(input, 'hello');
    expect(screen.queryByRole('list', { name: 'Record commands' })).toBeNull();
  });

  it('shows no hints when the caller has no commands', async () => {
    const user = userEvent.setup();
    render(
      <SessionCommentComposer
        currentUser={undefined}
        onAddComment={() => {}}
        isPosting={false}
      />,
    );
    await user.type(screen.getByRole('textbox', { name: 'Add a comment' }), ':add');
    expect(screen.queryByRole('list', { name: 'Record commands' })).toBeNull();
  });

  it('clicking a hint starts that command in the box', async () => {
    const { user, input } = setup();
    await user.type(input, ':');
    await user.click(screen.getByText(/^:del/));
    expect(input.textContent).toBe(':del ');
  });

  it('hands a command to run with the picked players as chips, never posts it, and clears the box once it was sent', async () => {
    const { user, input, onAddComment, run } = setup();
    await user.type(input, ':add @Ba{Enter}');
    await user.type(input, '21 vs 15 @An{Enter}');
    await user.keyboard('{Enter}');
    expect(run).toHaveBeenCalledWith([
      { kind: 'text', text: ':add ' },
      { kind: 'mention', userId: 'u-bao', name: 'Bao' },
      { kind: 'text', text: ' 21 vs 15 ' },
      { kind: 'mention', userId: 'u-an', name: 'An' },
    ]);
    expect(onAddComment).not.toHaveBeenCalled();
    expect(input).toBeEmptyDOMElement();
  });

  it('keeps the text of a command that was refused so it can be fixed', async () => {
    const { user, input, onAddComment, run } = setup(() => ({ handled: true, accepted: false }));
    await user.type(input, ':add hello{Enter}');
    expect(run).toHaveBeenCalled();
    expect(onAddComment).not.toHaveBeenCalled();
    expect(input.textContent).toBe(':add hello');
  });

  it('posts a text that is not a command as a normal comment', async () => {
    const { user, input, onAddComment } = setup(() => ({ handled: false, accepted: false }));
    await user.type(input, ':added yesterday{Enter}');
    expect(onAddComment).toHaveBeenCalledWith(':added yesterday');
    expect(input).toBeEmptyDOMElement();
  });

  it('offers the players for an @ word and inserts the picked one', async () => {
    const { user, input } = setup();
    await user.type(input, ':add @A');
    const list = screen.getByRole('listbox', { name: 'Players' });
    expect(list.querySelectorAll('[role="option"]')).toHaveLength(2);
    expect(screen.getByRole('option', { name: 'An' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Anh Tuấn' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Bao' })).toBeNull();
    await user.click(screen.getByRole('option', { name: 'Anh Tuấn' }));
    expect(input.textContent).toBe(':add @Anh Tuấn ');
    expect(screen.queryByRole('listbox', { name: 'Players' })).toBeNull();
  });

  it('moves with the arrows, picks with Enter instead of sending, and closes with Escape', async () => {
    const { user, input, run } = setup();
    await user.type(input, ':add @A');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(input.textContent).toBe(':add @Anh Tuấn ');
    expect(run).not.toHaveBeenCalled();

    await user.type(input, '1 vs @');
    expect(screen.getByRole('listbox', { name: 'Players' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox', { name: 'Players' })).toBeNull();
  });

  it('does not offer players inside a normal comment', async () => {
    const { user, input } = setup();
    await user.type(input, 'see you @A');
    expect(screen.queryByRole('listbox', { name: 'Players' })).toBeNull();
  });

  it('marks the caller with (you) in the player list, in the order the list was given (the caller first)', async () => {
    const { user, input } = setup(undefined, [
      { id: 'u-an', token: 'An', name: 'An', avatarUrl: null, isCurrentUser: true },
      { id: 'u-bao', token: 'Bao', name: 'Bao', avatarUrl: null, isCurrentUser: false },
    ]);
    await user.type(input, ':add @');
    const names = within(screen.getByRole('listbox', { name: 'Players' }))
      .getAllByRole('option')
      .map((option) => option.querySelector('span.truncate')?.textContent);
    expect(names).toEqual(['An (you)', 'Bao']);
  });

  it('writes two players with the same name the same way: no (1), (2)', async () => {
    const { user, input } = setup(undefined, [
      { id: 'u-nam1', token: 'Nam', name: 'Nam', avatarUrl: null, isCurrentUser: false },
      { id: 'u-nam2', token: 'Nam', name: 'Nam', avatarUrl: null, isCurrentUser: false },
    ]);
    await user.type(input, ':add @');
    const names = within(screen.getByRole('listbox', { name: 'Players' }))
      .getAllByRole('option')
      .map((option) => option.querySelector('span.truncate')?.textContent);
    expect(names).toEqual(['Nam', 'Nam']);
  });

  describe('the hints as a list to move through and to read', () => {
    const hintButtons = () => within(screen.getByRole('list', { name: 'Record commands' })).getAllByRole('button');
    const sendButton = () => screen.getByRole('button', { name: 'Post comment' });

    it('Down from the box focuses the first hint, Up and Down move between hints, Up from the first returns to the box', async () => {
      const { user, input } = setup(undefined, mentions, realHints);
      await user.type(input, ':');
      expect(hintButtons()).toHaveLength(3);
      await user.keyboard('{ArrowDown}');
      expect(hintButtons()[0]).toHaveFocus();
      await user.keyboard('{ArrowDown}');
      expect(hintButtons()[1]).toHaveFocus();
      await user.keyboard('{ArrowDown}{ArrowDown}');
      expect(hintButtons()[2]).toHaveFocus();
      await user.keyboard('{ArrowUp}');
      expect(hintButtons()[1]).toHaveFocus();
      await user.keyboard('{ArrowUp}{ArrowUp}');
      expect(input).toHaveFocus();
    });

    it('Esc in a hint goes back to the box, and Enter starts the focused command', async () => {
      const { user, input } = setup(undefined, mentions, realHints);
      await user.type(input, ':');
      await user.keyboard('{ArrowDown}{ArrowDown}{Escape}');
      expect(input).toHaveFocus();
      await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
      expect(input).toHaveTextContent(':upd');
      expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('Tab goes through the hints first and then to the Send button', async () => {
      const { user, input } = setup(undefined, mentions, realHints);
      await user.type(input, ':');
      await user.tab();
      expect(hintButtons()[0]).toHaveFocus();
      await user.tab();
      expect(hintButtons()[1]).toHaveFocus();
      await user.tab();
      expect(hintButtons()[2]).toHaveFocus();
      await user.tab();
      expect(sendButton()).toHaveFocus();
    });

    it('Tab goes straight to Send when there are no hints', async () => {
      const { user, input } = setup(undefined, mentions, realHints);
      await user.type(input, 'hello');
      await user.tab();
      expect(sendButton()).toHaveFocus();
    });

    it('Down does nothing special without hints, and does not take over the arrows of an open @ list', async () => {
      const { user, input } = setup(undefined, mentions, realHints);
      await user.type(input, 'hello');
      await user.keyboard('{ArrowDown}');
      expect(input).toHaveFocus();
      await user.clear(input);
      await user.type(input, ':add @');
      await user.keyboard('{ArrowDown}');
      expect(input).toHaveFocus();
      expect(screen.getByRole('listbox', { name: 'Players' })).toBeInTheDocument();
    });

    it('bolds the words of a hint that the typed text covers, and nothing else', async () => {
      const { user, input } = setup(undefined, mentions, realHints);
      const boldWords = () =>
        Array.from(screen.getByRole('list', { name: 'Record commands' }).querySelectorAll('.font-semibold')).map(
          (element) => element.textContent,
        );
      await user.type(input, ':a');
      expect(boldWords()).toEqual([':a']);
      await user.type(input, 'dd ');
      expect(boldWords()).toEqual([':add']);
      await user.type(input, '@Ba');
      await user.keyboard('{Enter}');
      expect(boldWords()).toEqual([':add', '@player1']);
      await user.type(input, '21 vs');
      expect(boldWords()).toEqual([':add', '@player1', '[score]', 'vs']);
    });

    it('a hint still reads as the whole template for a reader', async () => {
      const { user, input } = setup(undefined, mentions, realHints);
      await user.type(input, ':add ');
      expect(hintButtons()[0]).toHaveTextContent(':add @player1 [@player2] [score] vs [score] @player1 [@player2]');
    });
  });
});
