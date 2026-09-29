import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UnsavedPostConfirmDialog } from './UnsavedPostConfirmDialog';

const noop = () => {};

describe('UnsavedPostConfirmDialog', () => {
  it('is not rendered when isOpen is false', () => {
    render(<UnsavedPostConfirmDialog isOpen={false} onStay={noop} onLeave={noop} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the draft-loss warning with Keep editing / Leave', () => {
    render(<UnsavedPostConfirmDialog isOpen onStay={noop} onLeave={noop} />);
    expect(screen.getByText('Leave without posting?')).toBeInTheDocument();
    expect(
      screen.getByText('You have an unsaved post draft. Leaving now will lose what you typed.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep editing' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave' })).toBeInTheDocument();
  });

  it('calls onStay when Keep editing is clicked', async () => {
    const user = userEvent.setup();
    const onStay = vi.fn();
    render(<UnsavedPostConfirmDialog isOpen onStay={onStay} onLeave={noop} />);
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(onStay).toHaveBeenCalledTimes(1);
  });

  it('calls onLeave when Leave is clicked', async () => {
    const user = userEvent.setup();
    const onLeave = vi.fn();
    render(<UnsavedPostConfirmDialog isOpen onStay={noop} onLeave={onLeave} />);
    await user.click(screen.getByRole('button', { name: 'Leave' }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});
