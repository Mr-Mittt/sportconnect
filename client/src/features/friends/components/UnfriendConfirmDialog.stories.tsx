import type { Meta, StoryObj } from '@storybook/react-vite';
import { UnfriendConfirmDialog } from './UnfriendConfirmDialog';

const meta = {
  title: 'Friends/UnfriendConfirmDialog',
  component: UnfriendConfirmDialog,
  args: {
    isOpen: true,
    onClose: () => {},
    onConfirm: () => {},
    isSubmitting: false,
    isError: false,
    personName: 'Priya Shah',
  },
} satisfies Meta<typeof UnfriendConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Submitting: Story = { args: { isSubmitting: true } };
export const ErrorState: Story = { args: { isError: true } };
