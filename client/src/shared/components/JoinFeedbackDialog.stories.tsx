import type { Meta, StoryObj } from '@storybook/react-vite';
import { JoinFeedbackDialog } from './JoinFeedbackDialog';

const meta = {
  title: 'Shared/JoinFeedbackDialog',
  component: JoinFeedbackDialog,
  args: {
    kind: 'JOINED',
    onDismiss: () => {},
  },
} satisfies Meta<typeof JoinFeedbackDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** After joining an auto-approve session (or accepting an invitation). */
export const Joined: Story = {};

/** After sending a join request to a session that needs host approval. */
export const RequestSent: Story = { args: { kind: 'REQUESTED' } };

/** Join fired from a session card: "Open session" also closes the pop-up and opens the detail. */
export const JoinedFromCard: Story = { args: { onOpenSession: () => {} } };

/** Same, for a join request. */
export const RequestSentFromCard: Story = { args: { kind: 'REQUESTED', onOpenSession: () => {} } };
