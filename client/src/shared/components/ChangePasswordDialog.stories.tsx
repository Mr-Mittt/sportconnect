import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChangePasswordDialog } from './ChangePasswordDialog';

const meta = {
  title: 'Shared/ChangePasswordDialog',
  component: ChangePasswordDialog,
  args: {
    isOpen: true,
    onClose: () => {},
    onSubmit: () => {},
    isSubmitting: false,
    errorMessage: null,
  },
} satisfies Meta<typeof ChangePasswordDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Submitting: Story = { args: { isSubmitting: true } };
export const WrongCurrentPassword: Story = {
  args: { errorMessage: 'Your current password is incorrect.', isCurrentPasswordError: true },
};
export const GeneralError: Story = {
  args: { errorMessage: 'Something went wrong on our side. Please try again.' },
};
