import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ResetPasswordForm } from './ResetPasswordForm';

function renderForm(props: Partial<React.ComponentProps<typeof ResetPasswordForm>> = {}) {
  const onSubmit = vi.fn();
  render(<ResetPasswordForm onSubmit={onSubmit} isPending={false} errorMessage={null} {...props} />);
  return { onSubmit };
}

describe('ResetPasswordForm', () => {
  it('submits the new password when both fields match', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await user.type(screen.getByLabelText('New password'), 'newpassword1');
    await user.type(screen.getByLabelText('Confirm new password'), 'newpassword1');
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    expect(onSubmit).toHaveBeenCalledWith('newpassword1');
  });

  it('rejects a password under 8 characters', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await user.type(screen.getByLabelText('New password'), 'short');
    await user.type(screen.getByLabelText('Confirm new password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a confirmation that does not match', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await user.type(screen.getByLabelText('New password'), 'newpassword1');
    await user.type(screen.getByLabelText('Confirm new password'), 'newpassword2');
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    expect(screen.getByText('The passwords don’t match.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('toggles password visibility for both fields', async () => {
    const user = userEvent.setup();
    renderForm();
    expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Confirm new password')).toHaveAttribute('type', 'text');
  });

  it('shows a server error banner', () => {
    renderForm({ errorMessage: 'Check the form and try again.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Check the form and try again.');
  });
});
