import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { RegisterForm } from './RegisterForm';

function renderForm(props: Partial<React.ComponentProps<typeof RegisterForm>> = {}) {
  const onSubmit = vi.fn();
  render(
    <MemoryRouter>
      <RegisterForm onSubmit={onSubmit} isPending={false} errorMessage={null} {...props} />
    </MemoryRouter>,
  );
  return { onSubmit };
}

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Email'), 'jordan@example.com');
  await user.type(screen.getByLabelText('Password'), 'password123');
  await user.type(screen.getByLabelText('Full name'), 'Jordan Lee');
}

describe('RegisterForm', () => {
  it('submits email, password, and full name without a phone number', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(onSubmit).toHaveBeenCalledWith({
      email: 'jordan@example.com',
      password: 'password123',
      fullName: 'Jordan Lee',
    });
  });

  it('includes phoneNumber when provided', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await fillRequiredFields(user);
    await user.type(screen.getByLabelText('Phone number (optional)'), '555-0100');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(onSubmit).toHaveBeenCalledWith({
      email: 'jordan@example.com',
      password: 'password123',
      fullName: 'Jordan Lee',
      phoneNumber: '555-0100',
    });
  });

  it('marks the password input with minLength=8 (jsdom does not enforce tooShort — see AUTH-2 summary)', () => {
    renderForm();
    expect(screen.getByLabelText('Password')).toHaveAttribute('minLength', '8');
  });

  it('does not submit with an empty full name (native required validation)', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText('Email'), 'jordan@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('renders the server error message inline', () => {
    renderForm({ errorMessage: 'Email already registered' });
    expect(screen.getByRole('alert')).toHaveTextContent('Email already registered');
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
    expect(screen.getByRole('button', { name: 'Creating account…' })).toBeDisabled();
  });

  it('renders OAuth buttons as disabled', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Continue with Facebook' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continue with Apple' })).toBeDisabled();
  });

  it('links to /login', () => {
    renderForm();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
  });
});
