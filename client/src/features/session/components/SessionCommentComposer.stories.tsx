import type { Meta, StoryObj } from '@storybook/react-vite';
import { SessionCommentComposer } from './SessionCommentComposer';

const meta = {
  title: 'Session/SessionCommentComposer',
  component: SessionCommentComposer,
  args: {
    currentUser: { fullName: 'Jordan Lee', avatarUrl: null },
    onAddComment: () => {},
    isPosting: false,
  },
} satisfies Meta<typeof SessionCommentComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Posting: Story = {
  args: { isPosting: true },
};

/** `currentUser` is undefined for the brief window before the caller's own identity resolves. */
export const NoCurrentUser: Story = {
  args: { currentUser: undefined },
};

const commands = {
  hints: [
    { command: 'add' as const, template: ':add @player1 [@player2] [score] vs [score] @player1 [@player2]' },
    { command: 'upd' as const, template: ':upd <id> @player1 [@player2] [score] vs [score] @player1 [@player2]' },
    { command: 'del' as const, template: ':del <id>' },
  ],
  mentions: [
    { id: 'a', token: 'Alice Nguyen', name: 'Alice Nguyen', avatarUrl: null },
    { id: 'b', token: 'Bob Tran', name: 'Bob Tran', avatarUrl: null },
    { id: 'c', token: 'Carol Le', name: 'Carol Le', avatarUrl: null },
  ],
  run: () => ({ handled: true, accepted: true }),
  isRunning: false,
};

/** CLIENT-GL-39: someone who can log results: type `:` for the command templates, `@` for the players. */
export const WithRecordCommands: Story = {
  args: { commands },
};
