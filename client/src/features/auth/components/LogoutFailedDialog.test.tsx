import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LogoutFailedDialog } from './LogoutFailedDialog';

function setup(overrides: Partial<ComponentProps<typeof LogoutFailedDialog>> = {}) {
  const props = { isOpen: true, onRetry: vi.fn(), onStay: vi.fn(), isRetrying: false, ...overrides };
  render(<LogoutFailedDialog {...props} />);
  return props;
}

describe('LogoutFailedDialog', () => {
  it('says the user is still signed in', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Couldn’t sign you out' })).toBeInTheDocument();
    expect(screen.getByText(/you’re still signed in/)).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    setup({ isOpen: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Try again calls onRetry only', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(props.onRetry).toHaveBeenCalledTimes(1);
    expect(props.onStay).not.toHaveBeenCalled();
  });

  it('Stay signed in and Esc call onStay, never onRetry', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Stay signed in' }));
    await userEvent.keyboard('{Escape}');
    expect(props.onStay).toHaveBeenCalledTimes(2);
    expect(props.onRetry).not.toHaveBeenCalled();
  });

  it('disables both buttons while retrying', () => {
    setup({ isRetrying: true });
    expect(screen.getByRole('button', { name: 'Trying…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Stay signed in' })).toBeDisabled();
  });
});
