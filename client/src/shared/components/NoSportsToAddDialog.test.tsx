import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NoSportsToAddDialog } from './NoSportsToAddDialog';

const noop = () => {};

describe('NoSportsToAddDialog (SPORT-5)', () => {
  it('renders nothing while closed', () => {
    render(
      <NoSportsToAddDialog
        isOpen={false}
        onClose={noop}
        isCatalogUnavailable={false}
        onRetry={noop}
        isRetrying={false}
      />,
    );

    expect(screen.queryByText('Nothing left to add')).not.toBeInTheDocument();
  });

  it('states the user has everything, with no retry offered', () => {
    render(
      <NoSportsToAddDialog
        isOpen
        onClose={noop}
        isCatalogUnavailable={false}
        onRetry={noop}
        isRetrying={false}
      />,
    );

    expect(screen.getByText('Nothing left to add')).toBeInTheDocument();
    expect(screen.getByText(/added every sport available/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('never claims completeness when the catalogue could not be read', () => {
    render(
      <NoSportsToAddDialog
        isOpen
        onClose={noop}
        isCatalogUnavailable
        onRetry={noop}
        isRetrying={false}
      />,
    );

    // The distinction the whole component exists for: "we don't know" must not be
    // rendered as "you have everything", which would be false rather than merely stale.
    expect(screen.getByText('Could not load sports')).toBeInTheDocument();
    expect(screen.queryByText(/added every sport available/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('calls onRetry, and disables the button while retrying', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { rerender } = render(
      <NoSportsToAddDialog
        isOpen
        onClose={noop}
        isCatalogUnavailable
        onRetry={onRetry}
        isRetrying={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(
      <NoSportsToAddDialog
        isOpen
        onClose={noop}
        isCatalogUnavailable
        onRetry={onRetry}
        isRetrying
      />,
    );
    expect(screen.getByRole('button', { name: 'Retrying…' })).toBeDisabled();
  });

  it('closes from OK', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <NoSportsToAddDialog
        isOpen
        onClose={onClose}
        isCatalogUnavailable={false}
        onRetry={noop}
        isRetrying={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
