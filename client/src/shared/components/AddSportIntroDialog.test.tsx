import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AddSportIntroDialog } from './AddSportIntroDialog';

const noop = () => {};
const baseProps = {
  isOpen: true,
  onClose: noop,
  onConfirm: noop,
  sportName: 'Badminton',
};

describe('AddSportIntroDialog', () => {
  it('names the sport in the body copy', () => {
    render(<AddSportIntroDialog {...baseProps} />);
    expect(
      screen.getByText(
        'This Badminton group — accepting this invitation will add this sport to your profile.',
      ),
    ).toBeInTheDocument();
  });

  it('is not rendered when isOpen is false', () => {
    render(<AddSportIntroDialog {...baseProps} isOpen={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls onConfirm when OK is clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<AddSportIntroDialog {...baseProps} onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
