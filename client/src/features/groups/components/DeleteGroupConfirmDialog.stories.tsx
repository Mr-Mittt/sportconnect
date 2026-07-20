import type { Meta, StoryObj } from '@storybook/react-vite';
import { DeleteGroupConfirmDialog } from './DeleteGroupConfirmDialog';

const meta = {
  title: 'Groups/DeleteGroupConfirmDialog',
  component: DeleteGroupConfirmDialog,
  args: {
    isOpen: true,
    onClose: () => {},
    onConfirm: () => {},
    isSubmitting: false,
    isError: false,
    groupName: 'Riverside Ballers',
  },
} satisfies Meta<typeof DeleteGroupConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Submitting: Story = { args: { isSubmitting: true } };
export const ErrorState: Story = { args: { isError: true } };
