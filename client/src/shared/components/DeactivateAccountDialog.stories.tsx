import type { Meta, StoryObj } from '@storybook/react-vite';
import { DeactivateAccountDialog } from './DeactivateAccountDialog';

const meta = {
  title: 'Shared/DeactivateAccountDialog',
  component: DeactivateAccountDialog,
  args: {
    isOpen: true,
    onClose: () => {},
    onConfirm: () => {},
    isSubmitting: false,
    errorMessage: null,
  },
} satisfies Meta<typeof DeactivateAccountDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Submitting: Story = { args: { isSubmitting: true } };
export const WrongPassword: Story = { args: { errorMessage: 'Your current password is incorrect.' } };
