import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LoginForm } from './LoginForm';

function renderForm(props: Partial<React.ComponentProps<typeof LoginForm>> = {}) {
  const onSubmit = vi.fn();
  render(
    <MemoryRouter>
      <LoginForm onSubmit={onSubmit} isPending={false} errorMessage={null} {...props} />
    </MemoryRouter>,
  );
  return { onSubmit };
}

describe('LoginForm', () => {
  it('submits email and password on valid input', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText('Email'), 'jordan@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(onSubmit).toHaveBeenCalledWith({ email: 'jordan@example.com', password: 'password123' });
  });

  it('submits via the Enter key', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText('Email'), 'jordan@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123{Enter}');

    expect(onSubmit).toHaveBeenCalledWith({ email: 'jordan@example.com', password: 'password123' });
  });

  it('does not submit with an empty password', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText('Email'), 'jordan@example.com');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('renders the server error message inline', () => {
    renderForm({ errorMessage: 'Invalid email or password' });
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password');
  });

  it('toggles password visibility', async () => {
    const user = userEvent.setup();
    renderForm();

    const passwordInput = screen.getByLabelText('Password');
    expect(passwordInput).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(passwordInput).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('disables the submit button while pending', () => {
    renderForm({ isPending: true });
    expect(screen.getByRole('button', { name: 'Logging in…' })).toBeDisabled();
  });

  it('renders OAuth buttons as disabled', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Continue with Facebook' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continue with Apple' })).toBeDisabled();
  });

  it('links to /register', () => {
    renderForm();
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/register',
    );
  });

  describe('custom validation (noValidate — no native browser popups, see I18N-10/CLIENT-I18N-2 doc comment)', () => {
    it('does not submit and shows no messages before any submit attempt', () => {
      renderForm();
      expect(screen.queryByText('Email is required.')).not.toBeInTheDocument();
      expect(screen.queryByText('Password is required.')).not.toBeInTheDocument();
    });

    it('shows required messages beside each label on an empty submit attempt, and never calls onSubmit', async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderForm();

      await user.click(screen.getByRole('button', { name: 'Log in' }));

      expect(screen.getByText('Email is required.')).toBeInTheDocument();
      expect(screen.getByText('Password is required.')).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('shows "Enter a valid email address." (not the required message) for a malformed email', async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderForm();

      await user.type(screen.getByLabelText('Email'), 'not-an-email');
      await user.type(screen.getByLabelText('Password'), 'password123');
      await user.click(screen.getByRole('button', { name: 'Log in' }));

      expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
      expect(screen.queryByText('Email is required.')).not.toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('clears a field message the moment that field becomes valid, without re-submitting', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.click(screen.getByRole('button', { name: 'Log in' }));
      expect(screen.getByText('Email is required.')).toBeInTheDocument();

      await user.type(screen.getByLabelText('Email'), 'jordan@example.com');
      expect(screen.queryByText('Email is required.')).not.toBeInTheDocument();
    });
  });
});
