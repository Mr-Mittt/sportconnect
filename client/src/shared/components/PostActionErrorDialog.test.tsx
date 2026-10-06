import { AxiosError, type AxiosResponse } from 'axios';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PostActionErrorDialog } from './PostActionErrorDialog';

function coded(status: number, errorCode: string): AxiosError {
  const error = new AxiosError('failed', 'ERR_BAD_REQUEST');
  error.response = { status, data: { success: false, message: 'English prose', errorCode } } as AxiosResponse;
  return error;
}

describe('PostActionErrorDialog', () => {
  it('renders nothing while there is no error', () => {
    render(<PostActionErrorDialog error={null} onDismiss={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the localized text for the failure code with a Got it button', () => {
    render(<PostActionErrorDialog error={coded(404, 'POST_NOT_FOUND')} onDismiss={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Post unavailable' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('This post no longer exists.');
  });

  it('falls back to the category copy for a code the client has no text for', () => {
    render(<PostActionErrorDialog error={coded(403, 'SOMETHING_NEW')} onDismiss={vi.fn()} />);
    expect(screen.getByRole('alert')).not.toHaveTextContent('English prose');
  });

  it('Got it dismisses', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<PostActionErrorDialog error={coded(403, 'POST_DELETE_FORBIDDEN')} onDismiss={onDismiss} />);
    await user.click(screen.getByRole('button', { name: 'Got it' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
