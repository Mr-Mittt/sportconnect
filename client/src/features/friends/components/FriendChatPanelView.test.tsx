import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@/features/chat/types';
import { FriendChatPanelView, type FriendChatPanelViewProps } from './FriendChatPanelView';

// jsdom has no IntersectionObserver — useInfiniteScrollSentinel (used for
// the "load earlier messages" affordance) needs a stub, same pattern
// Feed.test.tsx/GroupChatTabView.test.tsx already use for the same hook.
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
  content: 'Pickup game Sunday, you in?',
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
  content: "I'm in, what time?",
  createdAt: '2026-07-26T10:16:00Z',
  editedAt: null,
  deletedAt: null,
};

function baseProps(overrides: Partial<FriendChatPanelViewProps> = {}): FriendChatPanelViewProps {
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

describe('FriendChatPanelView', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  });

  it('shows a loading state while the conversation/history is loading', () => {
    render(<FriendChatPanelView {...baseProps({ isLoading: true })} />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows an error state when opening the conversation failed (e.g. the friends-only gate)', () => {
    render(<FriendChatPanelView {...baseProps({ isError: true })} />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load this conversation.");
  });

  it('shows an empty state when there are no messages', () => {
    render(<FriendChatPanelView {...baseProps()} />);
    expect(screen.getByText('No messages yet.')).toBeInTheDocument();
  });

  it("renders the other person's name on their bubble but not on the caller's own", () => {
    render(<FriendChatPanelView {...baseProps({ messages: [otherMessage, ownMessage] })} />);
    expect(screen.getByText('Priya Shah')).toBeInTheDocument();
    expect(screen.getByText("I'm in, what time?")).toBeInTheDocument();
    expect(screen.getByText('Pickup game Sunday, you in?')).toBeInTheDocument();
    expect(screen.queryByText('Ben Nyx')).not.toBeInTheDocument();
  });

  it("aligns the caller's own messages left and the other person's right (CHAT-13 reversed convention)", () => {
    render(<FriendChatPanelView {...baseProps({ messages: [otherMessage, ownMessage] })} />);
    const ownRow = screen.getByText('Pickup game Sunday, you in?').closest('.flex.flex-col');
    const otherRow = screen.getByText("I'm in, what time?").closest('.flex.flex-col');
    expect(ownRow).toHaveClass('items-start');
    expect(otherRow).toHaveClass('items-end');
  });

  it('sends a message and clears the draft', async () => {
    const sendMessage = vi.fn();
    const user = userEvent.setup();
    render(<FriendChatPanelView {...baseProps({ sendMessage })} />);

    const input = screen.getByLabelText('Message');
    await user.type(input, 'Pickup game Sunday, you in?');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(sendMessage).toHaveBeenCalledWith('Pickup game Sunday, you in?');
    expect(input).toHaveValue('');
  });

  it('disables Send while the draft is empty', () => {
    render(<FriendChatPanelView {...baseProps()} />);
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('disables Send and shows "Sending…" while a send is in flight', () => {
    render(<FriendChatPanelView {...baseProps({ messages: [ownMessage], isSending: true })} />);
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
  });

  it('disables the input and Send while loading or errored', () => {
    const { rerender } = render(<FriendChatPanelView {...baseProps({ isLoading: true })} />);
    expect(screen.getByLabelText('Message')).toBeDisabled();

    rerender(<FriendChatPanelView {...baseProps({ isError: true })} />);
    expect(screen.getByLabelText('Message')).toBeDisabled();
  });

  it('shows "Load earlier messages" when an older page exists, and calls loadOlderMessages on click', async () => {
    const loadOlderMessages = vi.fn();
    const user = userEvent.setup();
    render(
      <FriendChatPanelView
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
      <FriendChatPanelView {...baseProps({ messages: [ownMessage], hasOlderMessages: false })} />,
    );
    expect(screen.queryByRole('button', { name: 'Load earlier messages' })).not.toBeInTheDocument();
  });

  it('shows a disabled "Loading…" affordance while fetching an older page', () => {
    render(
      <FriendChatPanelView
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
      <FriendChatPanelView
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
    render(<FriendChatPanelView {...baseProps({ messages: [otherMessage, ownMessage] })} />);
    expect(screen.getAllByRole('button', { name: 'Edit message' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Delete message' })).toHaveLength(1);
  });

  it('the edit/delete affordance is hidden until hover/focus, positioned at the bottom-right of the bubble', () => {
    render(<FriendChatPanelView {...baseProps({ messages: [ownMessage] })} />);
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
    render(<FriendChatPanelView {...baseProps({ messages: [ownMessage], editMessage })} />);

    await user.click(screen.getByRole('button', { name: 'Edit message' }));

    const editInput = screen.getByLabelText('Edit message content');
    expect(editInput).toHaveValue('Pickup game Sunday, you in?');

    await user.clear(editInput);
    await user.type(editInput, 'Pickup game Monday, you in?');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(editMessage).toHaveBeenCalledWith(1, 'Pickup game Monday, you in?');
    expect(screen.queryByLabelText('Edit message content')).not.toBeInTheDocument();
  });

  it('Cancel restores the original message without calling editMessage', async () => {
    const editMessage = vi.fn();
    const user = userEvent.setup();
    render(<FriendChatPanelView {...baseProps({ messages: [ownMessage], editMessage })} />);

    await user.click(screen.getByRole('button', { name: 'Edit message' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(editMessage).not.toHaveBeenCalled();
    expect(screen.getByText('Pickup game Sunday, you in?')).toBeInTheDocument();
  });

  it('clicking Delete calls deleteMessage immediately, with no confirmation step', async () => {
    const deleteMessage = vi.fn();
    const user = userEvent.setup();
    render(<FriendChatPanelView {...baseProps({ messages: [ownMessage], deleteMessage })} />);

    await user.click(screen.getByRole('button', { name: 'Delete message' }));

    expect(deleteMessage).toHaveBeenCalledWith(1);
  });

  it('shows an "(edited)" tag for an edited message', () => {
    const edited = { ...ownMessage, editedAt: '2026-07-26T10:20:00Z' };
    render(<FriendChatPanelView {...baseProps({ messages: [edited] })} />);
    expect(screen.getByText('(edited)')).toBeInTheDocument();
  });

  it('renders a deleted message as a placeholder with no edit/delete affordance', () => {
    const deleted = { ...ownMessage, content: '', deletedAt: '2026-07-26T10:25:00Z' };
    render(<FriendChatPanelView {...baseProps({ messages: [deleted] })} />);

    expect(screen.getByText('Message deleted')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit message' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete message' })).not.toBeInTheDocument();
  });

  describe('typing indicator (CHAT-15)', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('shows nothing when no one is typing', () => {
      render(<FriendChatPanelView {...baseProps()} />);
      expect(screen.queryByText(/typing/)).not.toBeInTheDocument();
    });

    it('shows the other person is typing', () => {
      render(
        <FriendChatPanelView
          {...baseProps({ typingUsers: [{ userId: 'user-2', displayName: 'Priya Shah' }] })}
        />,
      );
      expect(screen.getByText('Priya Shah is typing…')).toBeInTheDocument();
    });

    it("never shows the caller's own id, even if the (theoretically impossible) server echo happened", () => {
      render(
        <FriendChatPanelView
          {...baseProps({ typingUsers: [{ userId: currentUserId, displayName: 'Ben Nyx' }] })}
        />,
      );
      expect(screen.queryByText(/typing/)).not.toBeInTheDocument();
    });

    it('sends a start signal once per idle→typing transition, then a stop signal after 5s of no further keystrokes', async () => {
      vi.useFakeTimers();
      const sendTyping = vi.fn();
      render(<FriendChatPanelView {...baseProps({ sendTyping })} />);

      const input = screen.getByLabelText('Message');
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
      render(<FriendChatPanelView {...baseProps({ sendTyping })} />);

      const input = screen.getByLabelText('Message');
      fireEvent.change(input, { target: { value: 'hi' } });
      expect(sendTyping).toHaveBeenNthCalledWith(1, true);

      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
      expect(sendTyping).toHaveBeenNthCalledWith(2, false);
    });
  });
});
