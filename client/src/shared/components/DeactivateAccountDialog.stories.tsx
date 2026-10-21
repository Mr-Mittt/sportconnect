import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import type { ConfirmationMethod } from '@/features/profile/confirmationProof';
import { makeCodeSender } from '@/features/profile/confirmationFixtures';
import { ConfirmationProofFields } from './ConfirmationProofFields';
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
    codeSender: makeCodeSender(),
  },
} satisfies Meta<typeof DeactivateAccountDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Submitting: Story = { args: { isSubmitting: true } };
export const WrongPassword: Story = {
  args: { errorMessage: 'Your current password is incorrect.', errorCode: 'CURRENT_PASSWORD_INCORRECT' },
};
export const GeneralError: Story = {
  args: { errorMessage: 'This service isn’t available right now. Try again later.', errorCode: 'SERVICE_UNAVAILABLE' },
};
export const PasswordLocked: Story = {
  args: {
    errorMessage: 'Too many wrong passwords.',
    errorCode: 'PASSWORD_ATTEMPTS_EXCEEDED',
    passwordLockSeconds: 14 * 60 + 5,
  },
};
export const PhoneOnlyAccount: Story = { args: { hasEmail: false } };

/** The email method, one state per story (the dialog opens on the password method, so these render the fields). */
function EmailMethod(props: Partial<React.ComponentProps<typeof ConfirmationProofFields>>) {
  const [method, setMethod] = useState<ConfirmationMethod>('email');
  const [code, setCode] = useState('');
  return (
    <div className="w-96 rounded-lg border border-border p-4">
      <ConfirmationProofFields
        idPrefix="story"
        method={method}
        onMethodChange={setMethod}
        password=""
        onPasswordChange={() => {}}
        code={code}
        onCodeChange={setCode}
        passwordLabel="Confirm with your password"
        hasEmail
        codeSender={makeCodeSender()}
        passwordLockSeconds={0}
        errorCode={null}
        errorMessage={null}
        {...props}
      />
    </div>
  );
}

export const EmailBeforeSend: Story = { render: () => <EmailMethod /> };
export const EmailCodeSentCountingDown: Story = {
  render: () => <EmailMethod codeSender={makeCodeSender({ hasSent: true, resendSecondsLeft: 42 })} />,
};
export const EmailCanResend: Story = {
  render: () => <EmailMethod codeSender={makeCodeSender({ hasSent: true })} />,
};
export const EmailSendFailed: Story = {
  render: () => (
    <EmailMethod
      codeSender={makeCodeSender({ errorMessage: 'This service isn’t available right now. Try again later.' })}
    />
  ),
};
export const EmailWrongCode: Story = {
  render: () => (
    <EmailMethod
      code="123456"
      codeSender={makeCodeSender({ hasSent: true })}
      errorCode="VERIFICATION_CODE_INVALID"
      errorMessage="That code isn’t correct. Check it and try again."
    />
  ),
};
export const EmailCodeExpired: Story = {
  render: () => (
    <EmailMethod
      codeSender={makeCodeSender({ hasSent: true })}
      errorCode="VERIFICATION_CODE_EXPIRED"
      errorMessage="This code has expired or was already used. Ask for a new one."
    />
  ),
};
