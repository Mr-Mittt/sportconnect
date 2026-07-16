import type { Meta, StoryObj } from '@storybook/react-vite';
import { UpdateBroadcastConfirmDialog } from './UpdateBroadcastConfirmDialog';

const meta = {
  title: 'Shared/UpdateBroadcastConfirmDialog',
  component: UpdateBroadcastConfirmDialog,
  args: {
    isOpen: true,
    onClose: () => {},
    onConfirm: () => {},
    isSubmitting: false,
    isError: false,
    existingText: 'Court booking confirmed for Sunday 9am, see you there!',
  },
} satisfies Meta<typeof UpdateBroadcastConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Submitting: Story = {
  args: { isSubmitting: true },
};

export const ErrorState: Story = {
  args: { isError: true },
};
