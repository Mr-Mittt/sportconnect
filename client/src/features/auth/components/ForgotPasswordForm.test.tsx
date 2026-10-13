import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ForgotPasswordForm } from './ForgotPasswordForm';

function renderForm(props: Partial<React.ComponentProps<typeof ForgotPasswordForm>> = {}) {
  const onSubmit = vi.fn();
  render(
    <MemoryRouter>
      <ForgotPasswordForm onSubmit={onSubmit} isPending={false} isSent={false} errorMessage={null} {...props} />
    </MemoryRouter>,
  );
  return { onSubmit };
}

describe('ForgotPasswordForm', () => {
  it('submits the trimmed email', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await user.type(screen.getByLabelText('Email'), ' jordan@example.com ');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(onSubmit).toHaveBeenCalledWith({ email: 'jordan@example.com' });
  });

  it('prefills the email from the login form', () => {
    renderForm({ initialEmail: 'jordan@example.com' });
    expect(screen.getByLabelText('Email')).toHaveValue('jordan@example.com');
  });

  it('shows a required error and does not submit an empty email', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(screen.getByText('Email is required.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows an invalid error for a malformed email', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the neutral confirmation, with no form, once sent', () => {
    renderForm({ isSent: true });
    expect(screen.getByRole('status')).toHaveTextContent('If an account exists for that email');
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login');
  });

  it('shows a server error banner', () => {
    renderForm({ errorMessage: 'Something went wrong.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong.');
  });
});
