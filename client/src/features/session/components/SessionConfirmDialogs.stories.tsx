import type { Meta, StoryObj } from '@storybook/react-vite';
import { LeaveWithoutSavingDialog, SessionReadinessDialog } from './SessionConfirmDialogs';

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
