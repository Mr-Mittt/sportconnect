import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@/features/chat/types';
import { GroupChatTabView, type GroupChatTabViewProps } from './GroupChatTabView';

// jsdom has no IntersectionObserver — useInfiniteScrollSentinel (used for
// the "load earlier messages" affordance) needs a stub, same pattern
// Feed.test.tsx already uses for the same hook.
class FakeIntersectionObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

const currentUserId = 'user-1';

const ownMessage: ChatMessage = {
  id: 1,
  conversationId: 7,
  senderId: currentUserId,
  senderFullName: 'Ben Nyx',
  senderAvatarUrl: null,
  content: 'Hey team, ready for Sunday?',
  createdAt: '2026-07-26T10:15:00Z',
  editedAt: null,
  deletedAt: null,
};

const otherMessage: ChatMessage = {
  id: 2,
  conversationId: 7,
  senderId: 'user-2',
  senderFullName: 'Priya Shah',
  senderAvatarUrl: null,
  content: 'Yep, see you at 9!',
  createdAt: '2026-07-26T10:16:00Z',
  editedAt: null,
  deletedAt: null,
};

function baseProps(overrides: Partial<GroupChatTabViewProps> = {}): GroupChatTabViewProps {
  return {
    currentUserId,
    messages: [],
    isLoading: false,
    isError: false,
    sendMessage: vi.fn(),
    isSending: false,
    editMessage: vi.fn(),
    isEditing: false,
    deleteMessage: vi.fn(),
    isDeleting: false,
    hasOlderMessages: false,
    isLoadingOlderMessages: false,
    isLoadOlderMessagesError: false,
    loadOlderMessages: vi.fn(),
    typingUsers: [],
    sendTyping: vi.fn(),
    ...overrides,
  };
}

describe('GroupChatTabView', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  });

  it('shows a loading state while the conversation/history is loading', () => {
    render(<GroupChatTabView {...baseProps({ isLoading: true })} />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows an error state when opening the conversation failed', () => {
    render(<GroupChatTabView {...baseProps({ isError: true })} />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load this group's chat.");
  });

  it('shows an empty state when there are no messages', () => {
    render(<GroupChatTabView {...baseProps()} />);
    expect(screen.getByText('No messages yet.')).toBeInTheDocument();
  });

  it("renders the other person's name on their bubble but not on the caller's own", () => {
    render(<GroupChatTabView {...baseProps({ messages: [otherMessage, ownMessage] })} />);
    expect(screen.getByText('Priya Shah')).toBeInTheDocument();
    expect(screen.getByText('Yep, see you at 9!')).toBeInTheDocument();
    expect(screen.getByText('Hey team, ready for Sunday?')).toBeInTheDocument();
    expect(screen.queryByText('Ben Nyx')).not.toBeInTheDocument();
  });

  it("aligns the caller's own messages left and other members' right (CHAT-13 reversed convention)", () => {
    render(<GroupChatTabView {...baseProps({ messages: [otherMessage, ownMessage] })} />);
    const ownRow = screen.getByText('Hey team, ready for Sunday?').closest('.flex.flex-col');
    const otherRow = screen.getByText('Yep, see you at 9!').closest('.flex.flex-col');
    expect(ownRow).toHaveClass('items-start');
    expect(otherRow).toHaveClass('items-end');
  });

  it("shows an avatar for other members' messages but not the caller's own", () => {
    render(<GroupChatTabView {...baseProps({ messages: [otherMessage, ownMessage] })} />);
    // Radix Avatar's <img> never fires a real load event in jsdom, so the
    // fallback (initials) is what actually renders — a reliable proxy for
    // "an avatar is present here" without depending on image loading.
    expect(screen.getByText('PS')).toBeInTheDocument();
    expect(screen.queryByText('BN')).not.toBeInTheDocument();
  });

  it('shows an avatar only on the last message of a consecutive run from the same sender', () => {
    const firstOfRun = otherMessage;
    const secondOfRun: ChatMessage = { ...otherMessage, id: 5, content: 'One more thing' };
    render(<GroupChatTabView {...baseProps({ messages: [firstOfRun, secondOfRun] })} />);

    expect(screen.getByText('Yep, see you at 9!')).toBeInTheDocument();
    expect(screen.getByText('One more thing')).toBeInTheDocument();
    expect(screen.getAllByText('PS')).toHaveLength(1); // one avatar, not two
  });

  it('gives each sender their own avatar once a different sender interrupts the run', () => {
    const fromPriya = otherMessage;
    const fromJordan: ChatMessage = {
      ...otherMessage,
      id: 6,
      senderId: 'user-3',
      senderFullName: 'Jordan Lee',
      content: 'Count me in too',
    };
    render(<GroupChatTabView {...baseProps({ messages: [fromPriya, fromJordan] })} />);

    expect(screen.getByText('PS')).toBeInTheDocument();
    expect(screen.getByText('JL')).toBeInTheDocument();
  });

  it('sends a message and clears the draft', async () => {
    const sendMessage = vi.fn();
    const user = userEvent.setup();
    render(<GroupChatTabView {...baseProps({ sendMessage })} />);

    const input = screen.getByLabelText('Message the group');
    await user.type(input, 'Hey team, ready for Sunday?');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(sendMessage).toHaveBeenCalledWith('Hey team, ready for Sunday?');
    expect(input).toHaveValue('');
  });

  it('disables Send while the draft is empty', () => {
    render(<GroupChatTabView {...baseProps()} />);
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('disables Send and shows "Sending…" while a send is in flight', () => {
    render(<GroupChatTabView {...baseProps({ messages: [ownMessage], isSending: true })} />);
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
  });

  it('disables the input and Send while loading or errored', () => {
    const { rerender } = render(<GroupChatTabView {...baseProps({ isLoading: true })} />);
    expect(screen.getByLabelText('Message the group')).toBeDisabled();

    rerender(<GroupChatTabView {...baseProps({ isError: true })} />);
    expect(screen.getByLabelText('Message the group')).toBeDisabled();
  });

  it('shows "Load earlier messages" when an older page exists, and calls loadOlderMessages on click', async () => {
    const loadOlderMessages = vi.fn();
    const user = userEvent.setup();
    render(
      <GroupChatTabView
        {...baseProps({
          messages: [otherMessage, ownMessage],
          hasOlderMessages: true,
          loadOlderMessages,
        })}
      />,
    );

    const button = screen.getByRole('button', { name: 'Load earlier messages' });
    await user.click(button);

    expect(loadOlderMessages).toHaveBeenCalled();
  });

  it('does not show "Load earlier messages" when no older page exists', () => {
    render(
      <GroupChatTabView {...baseProps({ messages: [ownMessage], hasOlderMessages: false })} />,
    );
    expect(screen.queryByRole('button', { name: 'Load earlier messages' })).not.toBeInTheDocument();
  });

  it('shows a disabled "Loading…" affordance while fetching an older page', () => {
    render(
      <GroupChatTabView
        {...baseProps({
          messages: [ownMessage],
          hasOlderMessages: true,
          isLoadingOlderMessages: true,
        })}
      />,
    );
    const button = screen.getByRole('button', { name: 'Loading…' });
    expect(button).toBeDisabled();
  });

  it('shows a Retry affordance when loading an older page failed', async () => {
    const loadOlderMessages = vi.fn();
    const user = userEvent.setup();
    render(
      <GroupChatTabView
        {...baseProps({
          messages: [ownMessage],
          hasOlderMessages: true,
          isLoadOlderMessagesError: true,
          loadOlderMessages,
        })}
      />,
    );

    expect(screen.getByText("Couldn't load earlier messages.")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(loadOlderMessages).toHaveBeenCalled();
  });

  it("shows edit/delete affordances only on the caller's own messages", () => {
    render(<GroupChatTabView {...baseProps({ messages: [otherMessage, ownMessage] })} />);
    expect(screen.getAllByRole('button', { name: 'Edit message' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Delete message' })).toHaveLength(1);
  });

  it('the edit/delete affordance is hidden until hover/focus, positioned at the bottom-right of the bubble', () => {
    render(<GroupChatTabView {...baseProps({ messages: [ownMessage] })} />);
    const editButton = screen.getByRole('button', { name: 'Edit message' });
    const overlay = editButton.parentElement;
    expect(overlay).toHaveClass('opacity-0');
    expect(overlay).toHaveClass('group-hover:opacity-100');
    expect(overlay).toHaveClass('focus-within:opacity-100');
    expect(overlay).toHaveClass('absolute');
    expect(overlay).toHaveClass('right-1');
  });

  it('editing a message shows a prefilled inline input, and Save calls editMessage', async () => {
    const editMessage = vi.fn();
    const user = userEvent.setup();
    render(<GroupChatTabView {...baseProps({ messages: [ownMessage], editMessage })} />);

    await user.click(screen.getByRole('button', { name: 'Edit message' }));

    const editInput = screen.getByLabelText('Edit message content');
    expect(editInput).toHaveValue('Hey team, ready for Sunday?');

    await user.clear(editInput);
    await user.type(editInput, 'Hey team, ready for Monday?');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(editMessage).toHaveBeenCalledWith(1, 'Hey team, ready for Monday?');
    expect(screen.queryByLabelText('Edit message content')).not.toBeInTheDocument();
  });

  it('Cancel restores the original message without calling editMessage', async () => {
    const editMessage = vi.fn();
    const user = userEvent.setup();
    render(<GroupChatTabView {...baseProps({ messages: [ownMessage], editMessage })} />);

    await user.click(screen.getByRole('button', { name: 'Edit message' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(editMessage).not.toHaveBeenCalled();
    expect(screen.getByText('Hey team, ready for Sunday?')).toBeInTheDocument();
  });

  it('clicking Delete calls deleteMessage immediately, with no confirmation step', async () => {
    const deleteMessage = vi.fn();
    const user = userEvent.setup();
    render(<GroupChatTabView {...baseProps({ messages: [ownMessage], deleteMessage })} />);

    await user.click(screen.getByRole('button', { name: 'Delete message' }));

    expect(deleteMessage).toHaveBeenCalledWith(1);
  });

  it('shows an "(edited)" tag for an edited message', () => {
    const edited = { ...ownMessage, editedAt: '2026-07-26T10:20:00Z' };
    render(<GroupChatTabView {...baseProps({ messages: [edited] })} />);
    expect(screen.getByText('(edited)')).toBeInTheDocument();
  });

  it('renders a deleted message as a placeholder with no edit/delete affordance', () => {
    const deleted = { ...ownMessage, content: '', deletedAt: '2026-07-26T10:25:00Z' };
    render(<GroupChatTabView {...baseProps({ messages: [deleted] })} />);

    expect(screen.getByText('Message deleted')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit message' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete message' })).not.toBeInTheDocument();
  });

  describe('typing indicator (CHAT-15)', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('shows nothing when no one is typing', () => {
      render(<GroupChatTabView {...baseProps()} />);
      expect(screen.queryByText(/typing/)).not.toBeInTheDocument();
    });

    it("shows one other member's name", () => {
      render(
        <GroupChatTabView
          {...baseProps({ typingUsers: [{ userId: 'user-2', displayName: 'Priya Shah' }] })}
        />,
      );
      expect(screen.getByText('Priya Shah is typing…')).toBeInTheDocument();
    });

    it('shows both names for two typing members', () => {
      render(
        <GroupChatTabView
          {...baseProps({
            typingUsers: [
              { userId: 'user-2', displayName: 'Priya Shah' },
              { userId: 'user-3', displayName: 'Jordan Lee' },
            ],
          })}
        />,
      );
      expect(screen.getByText('Priya Shah and Jordan Lee are typing…')).toBeInTheDocument();
    });

    it('collapses to a count for three or more typing members', () => {
      render(
        <GroupChatTabView
          {...baseProps({
            typingUsers: [
              { userId: 'user-2', displayName: 'Priya Shah' },
              { userId: 'user-3', displayName: 'Jordan Lee' },
              { userId: 'user-4', displayName: 'Sam Ortiz' },
            ],
          })}
        />,
      );
      expect(screen.getByText('3 people are typing…')).toBeInTheDocument();
    });

    it("never shows the caller's own id, even if the (theoretically impossible) server echo happened", () => {
      render(
        <GroupChatTabView
          {...baseProps({ typingUsers: [{ userId: currentUserId, displayName: 'Ben Nyx' }] })}
        />,
      );
      expect(screen.queryByText(/typing/)).not.toBeInTheDocument();
    });

    it('sends a start signal once per idle→typing transition, then a stop signal after 5s of no further keystrokes', async () => {
      vi.useFakeTimers();
      const sendTyping = vi.fn();
      render(<GroupChatTabView {...baseProps({ sendTyping })} />);

      const input = screen.getByLabelText('Message the group');
      fireEvent.change(input, { target: { value: 'a' } });
      expect(sendTyping).toHaveBeenCalledTimes(1);
      expect(sendTyping).toHaveBeenNthCalledWith(1, true);

      fireEvent.change(input, { target: { value: 'ab' } });
      expect(sendTyping).toHaveBeenCalledTimes(1); // still just the one start signal

      await vi.advanceTimersByTimeAsync(5000);
      expect(sendTyping).toHaveBeenCalledTimes(2);
      expect(sendTyping).toHaveBeenNthCalledWith(2, false);
    });

    it('sends a stop signal immediately on send, not waiting for the idle timeout', () => {
      const sendTyping = vi.fn();
      render(<GroupChatTabView {...baseProps({ sendTyping })} />);

      const input = screen.getByLabelText('Message the group');
      fireEvent.change(input, { target: { value: 'hi' } });
      expect(sendTyping).toHaveBeenNthCalledWith(1, true);

      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
      expect(sendTyping).toHaveBeenNthCalledWith(2, false);
    });
  });
});
