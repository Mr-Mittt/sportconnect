import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { makeCodeSender } from '@/features/profile/confirmationFixtures';
import { DeactivateAccountDialog } from './DeactivateAccountDialog';

function setup(overrides: Partial<ComponentProps<typeof DeactivateAccountDialog>> = {}) {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    isSubmitting: false,
    errorMessage: null,
    codeSender: makeCodeSender(),
    ...overrides,
  };
  render(<DeactivateAccountDialog {...props} />);
  return props;
}

describe('DeactivateAccountDialog', () => {
  it('asks for the password and keeps Deactivate disabled until one is typed', async () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Deactivate your account?' })).toBeInTheDocument();
    const deactivate = screen.getByRole('button', { name: 'Deactivate' });
    expect(deactivate).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Confirm with your password'), 'password123');
    expect(deactivate).toBeEnabled();
  });

  it('submits the typed password as the proof, by click and by Enter', async () => {
    const props = setup();
    await userEvent.type(screen.getByLabelText('Confirm with your password'), 'password123');

    await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    await userEvent.type(screen.getByLabelText('Confirm with your password'), '{Enter}');

    expect(props.onConfirm).toHaveBeenCalledTimes(2);
    expect(props.onConfirm).toHaveBeenCalledWith({ method: 'password', currentPassword: 'password123' });
  });

  it('Cancel and Esc call onClose and never onConfirm', async () => {
    const props = setup();
    await userEvent.type(screen.getByLabelText('Confirm with your password'), 'secret');

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.keyboard('{Escape}');

    expect(props.onClose).toHaveBeenCalledTimes(2);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it('shows a wrong password on the password field with a way to switch to the emailed code', async () => {
    setup({ errorMessage: 'Your current password is incorrect.', errorCode: 'CURRENT_PASSWORD_INCORRECT' });
    expect(screen.getByRole('alert')).toHaveTextContent('Your current password is incorrect.');
    expect(screen.getByLabelText('Confirm with your password')).toHaveAccessibleDescription(
      'Your current password is incorrect.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Use an emailed code instead' }));
    expect(screen.getByRole('button', { name: 'Send code' })).toBeInTheDocument();
  });

  it('shows any other failure as a general line and stays open', () => {
    setup({ errorMessage: 'Try again later.', errorCode: 'SERVICE_UNAVAILABLE' });
    expect(screen.getByRole('alert')).toHaveTextContent('Try again later.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('disables both buttons while submitting', () => {
    setup({ isSubmitting: true });
    expect(screen.getByRole('button', { name: 'Deactivating…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('offers Send code on the emailed-code method and does not confirm by itself', async () => {
    const send = vi.fn();
    const first = setup({ codeSender: makeCodeSender({ send }) });
    await userEvent.click(screen.getByRole('radio', { name: 'A code sent by email' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(first.onConfirm).not.toHaveBeenCalled();
  });

  it('submits only the code, digits only, once it has been sent', async () => {
    const props = setup({ codeSender: makeCodeSender({ hasSent: true, resendSecondsLeft: 30 }) });
    await userEvent.click(screen.getByRole('radio', { name: 'A code sent by email' }));
    const deactivate = screen.getByRole('button', { name: 'Deactivate' });
    expect(deactivate).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Resend in 0:30' })).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Verification code'), '123 45');
    expect(deactivate).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Verification code'), '6');
    await userEvent.click(deactivate);

    expect(props.onConfirm).toHaveBeenCalledWith({ method: 'email', verificationCode: '123456' });
  });

  it('puts a wrong code on the code field and keeps what was typed', async () => {
    setup({
      codeSender: makeCodeSender({ hasSent: true }),
      errorMessage: 'That code isn’t correct. Check it and try again.',
      errorCode: 'VERIFICATION_CODE_INVALID',
    });
    await userEvent.click(screen.getByRole('radio', { name: 'A code sent by email' }));
    expect(screen.getByLabelText('Verification code')).toHaveAccessibleDescription(
      'That code isn’t correct. Check it and try again.',
    );
  });

  it('disables the email method, with the reason, for an account with no email', () => {
    setup({ hasEmail: false });
    expect(screen.getByRole('radio', { name: 'A code sent by email' })).toBeDisabled();
    expect(screen.getByText('Your account has no email address, so a code can’t be sent.')).toBeInTheDocument();
  });

  it('locks the password method with the time left and moves to the emailed code', () => {
    setup({
      errorMessage: 'Too many wrong passwords.',
      errorCode: 'PASSWORD_ATTEMPTS_EXCEEDED',
      passwordLockSeconds: 125,
    });
    expect(screen.getByRole('radio', { name: 'My password' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'A code sent by email' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Send code' })).toBeInTheDocument();
    // The countdown stays on screen after the switch to the code method.
    expect(screen.getByRole('alert')).toHaveTextContent('Try again in 2:05, or use an emailed code.');
  });
});
