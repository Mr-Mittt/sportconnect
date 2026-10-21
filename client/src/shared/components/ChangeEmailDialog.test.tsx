import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { makeCodeSender } from '@/features/profile/confirmationFixtures';
import type { NewEmailCodeSender } from '@/features/profile/useEmailChangeCode';
import { ChangeEmailDialog } from './ChangeEmailDialog';

function makeNewEmailSender(overrides: Partial<NewEmailCodeSender> = {}): NewEmailCodeSender {
  return {
    send: vi.fn(),
    isSending: false,
    hasSent: false,
    resendSecondsLeft: 0,
    expiresInSeconds: 900,
    errorCode: null,
    errorMessage: null,
    closeCodeStep: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

type Props = ComponentProps<typeof ChangeEmailDialog>;

function makeProps(overrides: Partial<Props> = {}): Props {
  return {
    isOpen: true,
    onClose: vi.fn(),
    currentEmail: 'old@example.com',
    onSubmit: vi.fn(),
    isSubmitting: false,
    errorMessage: null,
    codeSender: makeCodeSender(),
    newEmailSender: makeNewEmailSender(),
    onClearError: vi.fn(),
    ...overrides,
  };
}

function setup(overrides: Partial<Props> = {}) {
  const props = makeProps(overrides);
  const view = render(<ChangeEmailDialog {...props} />);
  const rerender = (changes: Partial<Props>) => view.rerender(<ChangeEmailDialog {...props} {...changes} />);
  return { props, rerender };
}

const updateButton = () => screen.getByRole('button', { name: 'Update email' });

describe('ChangeEmailDialog', () => {
  it('asks for the proof first, then the new address, and keeps Update disabled', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Change your email' })).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm with your password')).toBeInTheDocument();
    expect(screen.getByLabelText('New email address')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled();
    expect(screen.queryByLabelText('Code sent to the new address')).not.toBeInTheDocument();
    expect(updateButton()).toBeDisabled();
  });

  it('warns that the change unlinks Google and that the address becomes the sign-in name', () => {
    setup();
    expect(screen.getByText(/unlinks your Google sign-in/)).toBeInTheDocument();
  });

  it('Verify asks for a code for the typed address (trimmed by the hook), and is enabled only with an address', async () => {
    const newEmailSender = makeNewEmailSender();
    setup({ newEmailSender });
    await userEvent.type(screen.getByLabelText('New email address'), 'new@example.com');

    await userEvent.click(screen.getByRole('button', { name: 'Verify' }));

    expect(newEmailSender.send).toHaveBeenCalledWith('new@example.com');
  });

  it('after a send: shows the code input beside a Re-send countdown, and Verify cannot be pressed meanwhile', async () => {
    const newEmailSender = makeNewEmailSender({ hasSent: true, resendSecondsLeft: 42 });
    setup({ newEmailSender });
    expect(screen.getByLabelText('Code sent to the new address')).toBeInTheDocument();
    // with an address typed, the only thing keeping the button off is the running countdown
    await userEvent.type(screen.getByLabelText('New email address'), 'new@example.com');
    expect(screen.getByRole('button', { name: 'Re-send in 0:42' })).toBeDisabled();
    expect(newEmailSender.send).not.toHaveBeenCalled();
  });

  it('after the countdown: the button reads Re-send and works', async () => {
    const newEmailSender = makeNewEmailSender({ hasSent: true });
    setup({ newEmailSender });
    await userEvent.type(screen.getByLabelText('New email address'), 'new@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Re-send' }));
    expect(newEmailSender.send).toHaveBeenCalledWith('new@example.com');
  });

  it('keeps the countdown on the button after the address is edited (the lock is per user)', () => {
    setup({ newEmailSender: makeNewEmailSender({ hasSent: false, resendSecondsLeft: 30 }) });
    expect(screen.getByRole('button', { name: 'Re-send in 0:30' })).toBeDisabled();
    expect(screen.queryByLabelText('Code sent to the new address')).not.toBeInTheDocument();
  });

  it('editing the address closes the code step and drops a stale error', async () => {
    const newEmailSender = makeNewEmailSender({ hasSent: true });
    const onClearError = vi.fn();
    setup({ newEmailSender, onClearError });

    await userEvent.type(screen.getByLabelText('New email address'), 'a');

    expect(newEmailSender.closeCodeStep).toHaveBeenCalled();
    expect(onClearError).toHaveBeenCalled();
  });

  it('enables Update only with the address verified-by-send, six digits and the proof', async () => {
    setup({ newEmailSender: makeNewEmailSender({ hasSent: true }) });
    await userEvent.type(screen.getByLabelText('Confirm with your password'), 'password123');
    await userEvent.type(screen.getByLabelText('New email address'), 'new@example.com');
    expect(updateButton()).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Code sent to the new address'), '65432');
    expect(updateButton()).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Code sent to the new address'), '1');
    expect(updateButton()).toBeEnabled();
  });

  it('keeps Update disabled once the code step is closed again, even with everything still typed', async () => {
    const props = makeProps({ newEmailSender: makeNewEmailSender({ hasSent: true }) });
    const view = render(<ChangeEmailDialog {...props} />);
    await userEvent.type(screen.getByLabelText('Confirm with your password'), 'password123');
    await userEvent.type(screen.getByLabelText('New email address'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('Code sent to the new address'), '654321');
    expect(updateButton()).toBeEnabled();

    view.rerender(<ChangeEmailDialog {...props} newEmailSender={makeNewEmailSender({ hasSent: false })} />);

    expect(updateButton()).toBeDisabled();
  });

  it('keeps Update disabled when the proof is missing even though both the address and its code are filled', async () => {
    setup({ newEmailSender: makeNewEmailSender({ hasSent: true }) });
    await userEvent.type(screen.getByLabelText('New email address'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('Code sent to the new address'), '654321');
    expect(updateButton()).toBeDisabled();
  });

  it('submits the address, the new-address code (digits only) and exactly the chosen proof', async () => {
    const { props } = setup({ newEmailSender: makeNewEmailSender({ hasSent: true }) });
    await userEvent.type(screen.getByLabelText('Confirm with your password'), 'password123');
    await userEvent.type(screen.getByLabelText('New email address'), ' new@example.com ');
    await userEvent.type(screen.getByLabelText('Code sent to the new address'), '654 321');

    await userEvent.click(updateButton());

    expect(props.onSubmit).toHaveBeenCalledWith({
      newEmail: 'new@example.com',
      newEmailCode: '654321',
      proof: { method: 'password', currentPassword: 'password123' },
    });
  });

  it('submits the code mailed to the current address as the proof when that method is chosen', async () => {
    const { props } = setup({
      newEmailSender: makeNewEmailSender({ hasSent: true }),
      codeSender: makeCodeSender({ hasSent: true }),
    });
    await userEvent.click(screen.getByRole('radio', { name: 'A code sent by email' }));
    await userEvent.type(screen.getByLabelText('Verification code'), '111 222');
    await userEvent.type(screen.getByLabelText('New email address'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('Code sent to the new address'), '654321');

    await userEvent.click(updateButton());

    expect(props.onSubmit).toHaveBeenCalledWith({
      newEmail: 'new@example.com',
      newEmailCode: '654321',
      proof: { method: 'email', verificationCode: '111222' },
    });
  });

  describe('Verify and Re-send start the proof from empty', () => {
    it('clears a typed password and the typed new-address code, so Update goes disabled again', async () => {
      const newEmailSender = makeNewEmailSender({ hasSent: true });
      setup({ newEmailSender });
      await userEvent.type(screen.getByLabelText('Confirm with your password'), 'password123');
      await userEvent.type(screen.getByLabelText('New email address'), 'new@example.com');
      await userEvent.type(screen.getByLabelText('Code sent to the new address'), '654321');
      expect(updateButton()).toBeEnabled();

      await userEvent.click(screen.getByRole('button', { name: 'Re-send' }));

      expect(newEmailSender.send).toHaveBeenCalledWith('new@example.com');
      expect(screen.getByLabelText('Confirm with your password')).toHaveValue('');
      expect(screen.getByLabelText('Code sent to the new address')).toHaveValue('');
      expect(updateButton()).toBeDisabled();
    });

    it('clears a typed code of the current address too', async () => {
      const newEmailSender = makeNewEmailSender({ hasSent: true });
      setup({ newEmailSender, codeSender: makeCodeSender({ hasSent: true }) });
      await userEvent.click(screen.getByRole('radio', { name: 'A code sent by email' }));
      await userEvent.type(screen.getByLabelText('Verification code'), '111222');
      await userEvent.type(screen.getByLabelText('New email address'), 'new@example.com');

      await userEvent.click(screen.getByRole('button', { name: 'Re-send' }));

      expect(screen.getByLabelText('Verification code')).toHaveValue('');
    });

    it('asking again for the current address code empties its own input', async () => {
      const send = vi.fn();
      setup({ codeSender: makeCodeSender({ hasSent: true, send }) });
      await userEvent.click(screen.getByRole('radio', { name: 'A code sent by email' }));
      await userEvent.type(screen.getByLabelText('Verification code'), '111222');

      await userEvent.click(screen.getByRole('button', { name: 'Resend code' }));

      expect(send).toHaveBeenCalled();
      expect(screen.getByLabelText('Verification code')).toHaveValue('');
    });
  });

  describe('refusals of the PUT', () => {
    async function typedForm() {
      const props = makeProps({ newEmailSender: makeNewEmailSender({ hasSent: true }) });
      const view = render(<ChangeEmailDialog {...props} />);
      await userEvent.type(screen.getByLabelText('Confirm with your password'), 'password123');
      await userEvent.type(screen.getByLabelText('New email address'), 'taken@example.com');
      await userEvent.type(screen.getByLabelText('Code sent to the new address'), '654321');
      const rerender = (changes: Partial<Props>) =>
        view.rerender(<ChangeEmailDialog {...props} {...changes} />);
      return { props, rerender };
    }

    it('a taken address: the line shows under the address, the code step closes and its code is cleared, the proof stays', async () => {
      const { rerender } = await typedForm();

      rerender({ errorMessage: 'An account with this email already exists. Use another address.', errorCode: 'EMAIL_ALREADY_REGISTERED' });

      expect(screen.getByLabelText('New email address')).toHaveAccessibleDescription(
        'An account with this email already exists. Use another address.',
      );
      expect(screen.queryByLabelText('Code sent to the new address')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Confirm with your password')).toHaveValue('password123');
      // the error is dropped (the user picked another address): the code step is back and its input is empty
      rerender({ errorMessage: null, errorCode: null });
      expect(screen.getByLabelText('Code sent to the new address')).toHaveValue('');
    });

    it('a wrong new-address code: the line shows on that input and every input is kept', async () => {
      const { rerender } = await typedForm();

      rerender({
        errorMessage: 'That code isn’t correct. Check it and try again.',
        errorCode: 'VERIFICATION_CODE_INVALID',
        codeSubject: 'NEW_EMAIL',
      });

      expect(screen.getByLabelText('Code sent to the new address')).toHaveAccessibleDescription(
        'That code isn’t correct. Check it and try again.',
      );
      expect(screen.getByLabelText('Code sent to the new address')).toHaveValue('654321');
      expect(screen.getByLabelText('Confirm with your password')).toHaveValue('password123');
      expect(screen.getByLabelText('New email address')).toHaveValue('taken@example.com');
    });

    it('an expired new-address code: the line shows on that input and the dead code is emptied, the proof is kept', async () => {
      const { rerender } = await typedForm();

      rerender({
        errorMessage: 'This code has expired or was already used. Ask for a new one.',
        errorCode: 'VERIFICATION_CODE_EXPIRED',
        codeSubject: 'NEW_EMAIL',
      });

      expect(screen.getByLabelText('Code sent to the new address')).toHaveValue('');
      expect(screen.getByLabelText('Code sent to the new address')).toHaveAccessibleDescription(
        'This code has expired or was already used. Ask for a new one.',
      );
      expect(screen.getByLabelText('Confirm with your password')).toHaveValue('password123');
    });

    it('a wrong code from the current address is shown on the proof code, not on the new-address code', async () => {
      const props = makeProps({
        newEmailSender: makeNewEmailSender({ hasSent: true }),
        codeSender: makeCodeSender({ hasSent: true }),
      });
      const view = render(<ChangeEmailDialog {...props} />);
      await userEvent.click(screen.getByRole('radio', { name: 'A code sent by email' }));
      await userEvent.type(screen.getByLabelText('Verification code'), '111222');
      await userEvent.type(screen.getByLabelText('New email address'), 'new@example.com');
      await userEvent.type(screen.getByLabelText('Code sent to the new address'), '654321');

      view.rerender(
        <ChangeEmailDialog
          {...props}
          errorMessage="That code isn’t correct. Check it and try again."
          errorCode="VERIFICATION_CODE_INVALID"
          codeSubject="CHANGE_EMAIL"
        />,
      );

      expect(screen.getByLabelText('Verification code')).toHaveAccessibleDescription(
        'That code isn’t correct. Check it and try again.',
      );
      expect(screen.getByLabelText('Code sent to the new address')).not.toHaveAccessibleDescription(/correct/);
      expect(screen.getByLabelText('Verification code')).toHaveValue('111222');
      expect(screen.getByLabelText('Code sent to the new address')).toHaveValue('654321');
    });

    it('a new-address code error is not repeated on the code input of the current address', async () => {
      const props = makeProps({
        newEmailSender: makeNewEmailSender({ hasSent: true }),
        codeSender: makeCodeSender({ hasSent: true }),
      });
      const view = render(<ChangeEmailDialog {...props} />);
      await userEvent.click(screen.getByRole('radio', { name: 'A code sent by email' }));
      await userEvent.type(screen.getByLabelText('Verification code'), '111222');
      await userEvent.type(screen.getByLabelText('New email address'), 'new@example.com');
      await userEvent.type(screen.getByLabelText('Code sent to the new address'), '654321');

      view.rerender(
        <ChangeEmailDialog
          {...props}
          errorMessage="That code isn’t correct. Check it and try again."
          errorCode="VERIFICATION_CODE_INVALID"
          codeSubject="NEW_EMAIL"
        />,
      );

      expect(screen.getByLabelText('Code sent to the new address')).toHaveAccessibleDescription(
        'That code isn’t correct. Check it and try again.',
      );
      expect(screen.getByLabelText('Verification code')).not.toHaveAccessibleDescription(/correct/);
      expect(screen.getByLabelText('Verification code')).not.toBeInvalid();
    });

    it('an expired code of the current address empties only that input', async () => {
      const props = makeProps({
        newEmailSender: makeNewEmailSender({ hasSent: true }),
        codeSender: makeCodeSender({ hasSent: true }),
      });
      const view = render(<ChangeEmailDialog {...props} />);
      await userEvent.click(screen.getByRole('radio', { name: 'A code sent by email' }));
      await userEvent.type(screen.getByLabelText('Verification code'), '111222');
      await userEvent.type(screen.getByLabelText('New email address'), 'new@example.com');
      await userEvent.type(screen.getByLabelText('Code sent to the new address'), '654321');

      view.rerender(
        <ChangeEmailDialog
          {...props}
          errorMessage="This code has expired or was already used. Ask for a new one."
          errorCode="VERIFICATION_CODE_EXPIRED"
          codeSubject="CHANGE_EMAIL"
        />,
      );

      expect(screen.getByLabelText('Verification code')).toHaveValue('');
      expect(screen.getByLabelText('Code sent to the new address')).toHaveValue('654321');
    });

    it('a wrong password is shown on the password field and everything typed is kept', async () => {
      const { rerender } = await typedForm();

      rerender({ errorMessage: 'Your current password is incorrect.', errorCode: 'CURRENT_PASSWORD_INCORRECT' });

      expect(screen.getByLabelText('Confirm with your password')).toHaveAccessibleDescription(
        'Your current password is incorrect.',
      );
      expect(screen.getByLabelText('Confirm with your password')).toHaveValue('password123');
      expect(screen.getByLabelText('Code sent to the new address')).toHaveValue('654321');
    });

    it('a 503 shows the try-again-later line and keeps every input', async () => {
      const { rerender } = await typedForm();

      rerender({ errorMessage: 'This service isn’t available right now. Try again later.', errorCode: 'SERVICE_UNAVAILABLE' });

      expect(screen.getByRole('alert')).toHaveTextContent('This service isn’t available right now. Try again later.');
      expect(screen.getByLabelText('Confirm with your password')).toHaveValue('password123');
      expect(screen.getByLabelText('New email address')).toHaveValue('taken@example.com');
      expect(screen.getByLabelText('Code sent to the new address')).toHaveValue('654321');
      expect(updateButton()).toBeEnabled();
    });
  });

  it('shows a failed Verify (a taken address) under the address input', () => {
    setup({
      newEmailSender: makeNewEmailSender({
        errorCode: 'EMAIL_ALREADY_REGISTERED',
        errorMessage: 'An account with this email already exists. Use another address.',
      }),
    });
    expect(screen.getByLabelText('New email address')).toHaveAccessibleDescription(
      'An account with this email already exists. Use another address.',
    );
  });

  it('shows a 503 on Verify under the address input, with no countdown', () => {
    setup({
      newEmailSender: makeNewEmailSender({
        errorCode: 'SERVICE_UNAVAILABLE',
        errorMessage: 'This service isn’t available right now. Try again later.',
      }),
    });
    expect(screen.getByLabelText('New email address')).toHaveAccessibleDescription(
      'This service isn’t available right now. Try again later.',
    );
    expect(screen.queryByRole('button', { name: /Re-send in/ })).not.toBeInTheDocument();
  });

  it('for an account with no email: reads Add email, proves with a password only', () => {
    setup({ currentEmail: null });
    expect(screen.getByRole('dialog', { name: 'Add an email' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add email' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'A code sent by email' })).toBeDisabled();
  });

  it('while submitting: Update shows its busy label and Cancel is disabled', () => {
    setup({ isSubmitting: true });
    expect(screen.getByRole('button', { name: 'Updating…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('Cancel closes', async () => {
    const { props } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onClose).toHaveBeenCalled();
  });
});
