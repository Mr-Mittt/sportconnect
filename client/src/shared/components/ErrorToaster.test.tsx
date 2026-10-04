import { render, screen } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { showErrorToast } from '@/shared/lib/errorToast';
import { ErrorToaster } from './ErrorToaster';

function httpError(status: number): AxiosError {
  const error = new AxiosError('failed', 'ERR_BAD_REQUEST');
  error.response = { status, data: { message: 'server text' } } as AxiosResponse;
  return error;
}

describe('ErrorToaster + showErrorToast', () => {
  it('renders a failure toast with the localized category copy', async () => {
    render(<ErrorToaster />);

    act(() => showErrorToast(httpError(403)));

    expect(await screen.findByText("You don't have access to this.")).toBeInTheDocument();
  });

  it('shows one toast when the same failure fires repeatedly', async () => {
    render(<ErrorToaster />);

    act(() => {
      showErrorToast(httpError(404));
      showErrorToast(httpError(404));
      showErrorToast(httpError(404));
    });

    expect(await screen.findAllByText('This no longer exists or was removed.')).toHaveLength(1);
  });

  it('shows nothing for a 401', () => {
    render(<ErrorToaster />);

    act(() => showErrorToast(httpError(401)));

    expect(screen.queryByText('server text')).not.toBeInTheDocument();
    expect(screen.queryByText('Your session has expired. Please sign in again.')).not.toBeInTheDocument();
  });
});
