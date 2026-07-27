import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
};

const otherMessage: ChatMessage = {
  id: 2,
  conversationId: 7,
  senderId: 'user-2',
  senderFullName: 'Priya Shah',
  senderAvatarUrl: null,
  content: 'Yep, see you at 9!',
  createdAt: '2026-07-26T10:16:00Z',
};

function baseProps(overrides: Partial<GroupChatTabViewProps> = {}): GroupChatTabViewProps {
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
        {...baseProps({ messages: [otherMessage, ownMessage], hasOlderMessages: true, loadOlderMessages })}
      />,
    );

    const button = screen.getByRole('button', { name: 'Load earlier messages' });
    await user.click(button);

    expect(loadOlderMessages).toHaveBeenCalled();
  });

  it('does not show "Load earlier messages" when no older page exists', () => {
    render(<GroupChatTabView {...baseProps({ messages: [ownMessage], hasOlderMessages: false })} />);
    expect(screen.queryByRole('button', { name: 'Load earlier messages' })).not.toBeInTheDocument();
  });

  it('shows a disabled "Loading…" affordance while fetching an older page', () => {
    render(
      <GroupChatTabView
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
});
