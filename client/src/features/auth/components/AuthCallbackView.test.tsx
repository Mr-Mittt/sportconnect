import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AuthCallbackView } from './AuthCallbackView';

describe('AuthCallbackView', () => {
  it('shows the signing-in line while the code is exchanged', () => {
    render(<AuthCallbackView errorMessage={null} onRetry={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Signing you in…');
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('shows the failure and starts over on Try again', async () => {
    const onRetry = vi.fn();
    render(<AuthCallbackView errorMessage="Your sign-in link expired." onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Your sign-in link expired.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
