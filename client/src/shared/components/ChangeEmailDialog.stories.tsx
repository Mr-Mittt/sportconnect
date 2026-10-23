import type { Meta, StoryObj } from '@storybook/react-vite';
import { makeCodeSender } from '@/features/profile/confirmationFixtures';
import type { NewEmailCodeSender } from '@/features/profile/useEmailChangeCode';
import { ChangeEmailDialog } from './ChangeEmailDialog';

function makeNewEmailSender(overrides: Partial<NewEmailCodeSender> = {}): NewEmailCodeSender {
  return {
    send: () => {},
    isSending: false,
    hasSent: false,
    resendSecondsLeft: 0,
    expiresInSeconds: 900,
    errorCode: null,
    errorMessage: null,
    closeCodeStep: () => {},
    reset: () => {},
    ...overrides,
  };
}

const meta = {
  title: 'Shared/ChangeEmailDialog',
  component: ChangeEmailDialog,
  args: {
    isOpen: true,
    onClose: () => {},
    currentEmail: 'jordan@example.com',
    onSubmit: () => {},
    isSubmitting: false,
    errorMessage: null,
    codeSender: makeCodeSender(),
    newEmailSender: makeNewEmailSender(),
    onClearError: () => {},
  },
} satisfies Meta<typeof ChangeEmailDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const CodeSentToNewAddress: Story = {
  args: { newEmailSender: makeNewEmailSender({ hasSent: true, resendSecondsLeft: 42 }) },
};
export const ResendAvailable: Story = { args: { newEmailSender: makeNewEmailSender({ hasSent: true }) } };
export const SendingCode: Story = { args: { newEmailSender: makeNewEmailSender({ isSending: true }) } };
export const Submitting: Story = {
  args: { isSubmitting: true, newEmailSender: makeNewEmailSender({ hasSent: true }) },
};
export const AddressAlreadyRegistered: Story = {
  args: {
    newEmailSender: makeNewEmailSender({
      errorCode: 'EMAIL_ALREADY_REGISTERED',
      errorMessage: 'An account with this email already exists. Use another address.',
    }),
  },
};
export const WrongNewAddressCode: Story = {
  args: {
    errorMessage: 'That code isn’t correct. Check it and try again.',
    errorCode: 'VERIFICATION_CODE_INVALID',
    codeSubject: 'NEW_EMAIL',
    newEmailSender: makeNewEmailSender({ hasSent: true }),
  },
};
export const WrongPassword: Story = {
  args: {
    errorMessage: 'Your current password is incorrect.',
    errorCode: 'CURRENT_PASSWORD_INCORRECT',
    newEmailSender: makeNewEmailSender({ hasSent: true }),
  },
};
export const PasswordLocked: Story = {
  args: {
    errorMessage: 'Too many wrong passwords.',
    errorCode: 'PASSWORD_ATTEMPTS_EXCEEDED',
    passwordLockSeconds: 14 * 60 + 5,
  },
};
export const ServiceUnavailable: Story = {
  args: {
    errorMessage: 'This service isn’t available right now. Try again later.',
    errorCode: 'SERVICE_UNAVAILABLE',
    newEmailSender: makeNewEmailSender({ hasSent: true }),
  },
};
export const ServiceUnavailableOnVerify: Story = {
  args: {
    newEmailSender: makeNewEmailSender({
      errorCode: 'SERVICE_UNAVAILABLE',
      errorMessage: 'This service isn’t available right now. Try again later.',
    }),
  },
};
export const PhoneOnlyAccount: Story = { args: { currentEmail: null } };
