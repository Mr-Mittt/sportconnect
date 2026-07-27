import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ChatMessage } from '@/features/chat/types';
import { GroupChatTabView } from './GroupChatTabView';

const currentUserId = 'user-1';

const ownMessage: ChatMessage = {
  id: 1,
  conversationId: 7,
  senderId: currentUserId,
  senderFullName: 'Ben Nyx',
  senderAvatarUrl: null,
  content: "Hey team, ready for Sunday?",
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
  content: "Yep, see you at 9!",
  createdAt: '2026-07-26T10:16:00Z',
  editedAt: null,
  deletedAt: null,
};

const editedOwnMessage: ChatMessage = {
  ...ownMessage,
  id: 3,
  content: 'Hey team, ready for Sunday at 10am?',
  editedAt: '2026-07-26T10:20:00Z',
};

const deletedOtherMessage: ChatMessage = {
  ...otherMessage,
  id: 4,
  content: '',
  deletedAt: '2026-07-26T10:25:00Z',
};

const meta = {
  title: 'Groups/GroupChatTabView',
  component: GroupChatTabView,
  args: {
    currentUserId,
    messages: [],
    isLoading: false,
    isError: false,
    sendMessage: () => {},
    isSending: false,
    editMessage: () => {},
    isEditing: false,
    deleteMessage: () => {},
    isDeleting: false,
    hasOlderMessages: false,
    isLoadingOlderMessages: false,
    isLoadOlderMessagesError: false,
    loadOlderMessages: () => {},
  },
} satisfies Meta<typeof GroupChatTabView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Conversation still opening / history still loading. */
export const Loading: Story = {
  args: { isLoading: true },
};

/** Opening the conversation (or loading history) failed — e.g. no longer a group member. */
export const Error: Story = {
  args: { isError: true },
};

/** Conversation opened, no messages sent yet. */
export const Empty: Story = {};

/** A short transcript mixing the caller's own messages and another member's — own left, other member's right with avatar. */
export const Populated: Story = {
  args: { messages: [otherMessage, ownMessage] },
};

/** An edited own message shows an "(edited)" tag; the edit/delete affordance only appears on own messages. */
export const WithEditedMessage: Story = {
  args: { messages: [otherMessage, editedOwnMessage] },
};

/** A deleted message (either side) renders an italic placeholder, no affordances. */
export const WithDeletedMessage: Story = {
  args: { messages: [deletedOtherMessage, ownMessage] },
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
