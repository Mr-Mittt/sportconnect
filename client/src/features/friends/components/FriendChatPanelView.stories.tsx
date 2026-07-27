import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ChatMessage } from '@/features/chat/types';
import { FriendChatPanelView } from './FriendChatPanelView';

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

const meta = {
  title: 'Friends/FriendChatPanelView',
  component: FriendChatPanelView,
  args: {
    currentUserId,
    messages: [],
    isLoading: false,
    isError: false,
    sendMessage: () => {},
    isSending: false,
    hasOlderMessages: false,
    isLoadingOlderMessages: false,
    isLoadOlderMessagesError: false,
    loadOlderMessages: () => {},
  },
} satisfies Meta<typeof FriendChatPanelView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Conversation still opening / history still loading. */
export const Loading: Story = {
  args: { isLoading: true },
};

/** Opening the conversation failed — e.g. the friends-only gate (no longer friends). */
export const Error: Story = {
  args: { isError: true },
};

/** Conversation opened, no messages sent yet. */
export const Empty: Story = {};

/** A short transcript mixing the caller's own messages and the other person's. */
export const Populated: Story = {
  args: { messages: [otherMessage, ownMessage] },
};

/** Older history exists — the "Load earlier messages" affordance shows above the transcript. */
export const HasOlderMessages: Story = {
  args: { messages: [otherMessage, ownMessage], hasOlderMessages: true },
};

/** Loading an older page after clicking "Load earlier messages". */
export const LoadingOlderMessages: Story = {
  args: { messages: [otherMessage, ownMessage], hasOlderMessages: true, isLoadingOlderMessages: true },
};

/** Loading an older page failed — a Retry affordance replaces the button. */
export const LoadOlderMessagesError: Story = {
  args: { messages: [otherMessage, ownMessage], hasOlderMessages: true, isLoadOlderMessagesError: true },
};

/** A send is in flight — Send button reads "Sending…" and is disabled. */
export const Sending: Story = {
  args: { messages: [otherMessage, ownMessage], isSending: true },
};
