import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
};

const otherMessage: ChatMessage = {
  id: 2,
  conversationId: 7,
  senderId: 'user-2',
  senderFullName: 'Priya Shah',
  senderAvatarUrl: null,
  content: "I'm in, what time?",
  createdAt: '2026-07-26T10:16:00Z',
};

function baseProps(overrides: Partial<FriendChatPanelViewProps> = {}): FriendChatPanelViewProps {
  return {
    currentUserId,
    messages: [],
    isLoading: false,
    isError: false,
    sendMessage: vi.fn(),
    isSending: false,
    hasOlderMessages: false,
    isLoadingOlderMessages: false,
    isLoadOlderMessagesError: false,
    loadOlderMessages: vi.fn(),
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
        {...baseProps({ messages: [otherMessage, ownMessage], hasOlderMessages: true, loadOlderMessages })}
      />,
    );

    const button = screen.getByRole('button', { name: 'Load earlier messages' });
    await user.click(button);

    expect(loadOlderMessages).toHaveBeenCalled();
  });

  it('does not show "Load earlier messages" when no older page exists', () => {
    render(<FriendChatPanelView {...baseProps({ messages: [ownMessage], hasOlderMessages: false })} />);
    expect(screen.queryByRole('button', { name: 'Load earlier messages' })).not.toBeInTheDocument();
  });

  it('shows a disabled "Loading…" affordance while fetching an older page', () => {
    render(
      <FriendChatPanelView
        {...baseProps({ messages: [ownMessage], hasOlderMessages: true, isLoadingOlderMessages: true })}
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
});
