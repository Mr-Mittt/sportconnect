import type { Meta, StoryObj } from '@storybook/react-vite';
import type { EmailVerificationSender } from '@/features/profile/useEmailVerification';
import { AccountEmailSection } from './AccountEmailSection';

function makeVerification(overrides: Partial<EmailVerificationSender> = {}): EmailVerificationSender {
  return { send: () => {}, isSending: false, hasSent: false, resendSecondsLeft: 0, errorMessage: null, ...overrides };
}

const meta = {
  title: 'Shared/AccountEmailSection',
  component: AccountEmailSection,
  args: {
    email: 'jordan@example.com',
    isVerified: true,
    verification: makeVerification(),
    onChangeEmail: () => {},
  },
} satisfies Meta<typeof AccountEmailSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Verified: Story = {};
export const NotVerified: Story = { args: { isVerified: false } };
export const VerificationSent: Story = {
  args: { isVerified: false, verification: makeVerification({ hasSent: true, resendSecondsLeft: 42 }) },
};
export const VerificationResendAvailable: Story = {
  args: { isVerified: false, verification: makeVerification({ hasSent: true }) },
};
export const VerificationUnavailable: Story = {
  args: {
    isVerified: false,
    verification: makeVerification({ errorMessage: 'This service isn’t available right now. Try again later.' }),
  },
};
export const NoEmail: Story = { args: { email: null, isVerified: false } };
