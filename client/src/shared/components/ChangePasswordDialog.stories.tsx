import type { Meta, StoryObj } from '@storybook/react-vite';
import { makeCodeSender } from '@/features/profile/confirmationFixtures';
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
    codeSender: makeCodeSender(),
  },
} satisfies Meta<typeof ChangePasswordDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Submitting: Story = { args: { isSubmitting: true } };
export const WrongCurrentPassword: Story = {
  args: { errorMessage: 'Your current password is incorrect.', errorCode: 'CURRENT_PASSWORD_INCORRECT' },
};
export const GeneralError: Story = {
  args: { errorMessage: 'Something went wrong on our side. Please try again.' },
};
export const NewPasswordRejected: Story = {
  args: {
    errorMessage: 'That new password doesn’t meet the password rules. Choose a different one.',
    errorCode: 'NEW_PASSWORD_REJECTED',
  },
};
export const PasswordLocked: Story = {
  args: {
    errorMessage: 'Too many wrong passwords.',
    errorCode: 'PASSWORD_ATTEMPTS_EXCEEDED',
    passwordLockSeconds: 14 * 60 + 5,
  },
};
export const PhoneOnlyAccount: Story = { args: { hasEmail: false } };
