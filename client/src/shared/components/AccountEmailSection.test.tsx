import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EmailVerificationSender } from '@/features/profile/useEmailVerification';
import { AccountEmailSection } from './AccountEmailSection';

function makeVerification(overrides: Partial<EmailVerificationSender> = {}): EmailVerificationSender {
  return { send: vi.fn(), isSending: false, hasSent: false, resendSecondsLeft: 0, errorMessage: null, ...overrides };
}

function setup(overrides: Partial<ComponentProps<typeof AccountEmailSection>> = {}) {
  const props = {
    email: 'jordan@example.com',
    isVerified: true,
    verification: makeVerification(),
    onChangeEmail: vi.fn(),
    ...overrides,
  };
  render(<AccountEmailSection {...props} />);
  return props;
}

describe('AccountEmailSection', () => {
  it('shows the address and a Change email button that opens the dialog', async () => {
    const props = setup();
    expect(screen.getByText('jordan@example.com')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Change email' }));
    expect(props.onChangeEmail).toHaveBeenCalled();
  });

  it('a verified address says Verified in words (not by colour alone) and offers no verification link', () => {
    setup({ isVerified: true });
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Get verification now' })).not.toBeInTheDocument();
  });

  it('an unverified address says so and the link asks for the verification mail', async () => {
    const verification = makeVerification();
    setup({ isVerified: false, verification });
    expect(screen.getByText('Not verified yet.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Get verification now' }));

    expect(verification.send).toHaveBeenCalled();
  });

  it('after the mail: a countdown replaces the link, with the hint to open the link in the mail', () => {
    setup({ isVerified: false, verification: makeVerification({ hasSent: true, resendSecondsLeft: 42 }) });
    expect(screen.getByText('Re-send in 0:42')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Get verification now' })).not.toBeInTheDocument();
    expect(screen.getByText(/valid for 12 hours/)).toBeInTheDocument();
  });

  it('once the countdown is over the link is back', () => {
    setup({ isVerified: false, verification: makeVerification({ hasSent: true, resendSecondsLeft: 0 }) });
    expect(screen.getByRole('button', { name: 'Get verification now' })).toBeInTheDocument();
  });

  it('shows a failed request as an alert under the status', () => {
    setup({ isVerified: false, verification: makeVerification({ errorMessage: 'This service isn’t available right now. Try again later.' }) });
    expect(screen.getByRole('alert')).toHaveTextContent('This service isn’t available right now. Try again later.');
  });

  it('a phone-only account has no status and the button reads Add email', () => {
    setup({ email: null, isVerified: false });
    expect(screen.getByText('No email address')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add email' })).toBeInTheDocument();
    expect(screen.queryByText('Verified')).not.toBeInTheDocument();
    expect(screen.queryByText('Not verified yet.')).not.toBeInTheDocument();
  });
});
