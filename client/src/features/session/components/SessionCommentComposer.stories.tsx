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
