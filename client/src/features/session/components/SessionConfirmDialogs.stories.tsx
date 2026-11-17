import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  ConfirmCancelRequestDialog,
  ConfirmLeaveDialog,
  LeaveWithoutSavingDialog,
  SessionReadinessDialog,
} from './SessionConfirmDialogs';

const meta = {
  title: 'Session/SessionReadinessDialog',
  component: SessionReadinessDialog,
  args: {
    isOpen: true,
    missing: [],
    onBack: () => {},
    onConfirm: () => {},
  },
} satisfies Meta<typeof SessionReadinessDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Something is missing: lists it, the session will be Preparing. "Continue editing" / "Create preparing session". */
export const Incomplete: Story = {
  args: { missing: ['location', 'fee', 'duration'] },
};

export const IncompleteOneGap: Story = {
  args: { missing: ['fee'] },
};

/** Nothing missing: ready to be Scheduled, cannot be edited afterwards. "Let me check again" / "Let's go". */
export const Complete: Story = {};

export const Submitting: Story = {
  args: { isSubmitting: true },
};

export const ScheduleFailed: Story = {
  args: { errorText: "Couldn't schedule the session. Try again." },
};

/** Shown when the create form is closed (click outside, Escape, the X) with unsent entries. */
export const LeaveWithoutSaving: StoryObj<typeof LeaveWithoutSavingDialog> = {
  render: () => <LeaveWithoutSavingDialog isOpen onStay={() => {}} onLeave={() => {}} />,
};

/** CLIENT-GL-51: asked before a joined participant leaves; the body counts down to the start. */
export const ConfirmLeave: StoryObj<typeof ConfirmLeaveDialog> = {
  render: () => (
    <ConfirmLeaveDialog
      isOpen
      scheduledStart={new Date(Date.now() + 26 * 3_600_000).toISOString()}
      onStay={() => {}}
      onConfirm={() => {}}
    />
  ),
};

/** CLIENT-GL-51: asked before a join request is withdrawn. */
export const ConfirmCancelRequest: StoryObj<typeof ConfirmCancelRequestDialog> = {
  render: () => <ConfirmCancelRequestDialog isOpen onKeep={() => {}} onConfirm={() => {}} />,
};
