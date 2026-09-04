import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReactivateSportNudgeDialog } from './ReactivateSportNudgeDialog';

const baseProps = {
  isOpen: true,
  sportName: 'Badminton',
  onLater: vi.fn(),
  onReactivate: vi.fn(),
  isReactivating: false,
  isError: false,
};

describe('ReactivateSportNudgeDialog', () => {
  it('sport-pill mode: generic copy, Later + Yes', async () => {
    const user = userEvent.setup();
    const onLater = vi.fn();
    const onReactivate = vi.fn();
    render(
      <ReactivateSportNudgeDialog
        {...baseProps}
        mode="sport-pill"
        onLater={onLater}
        onReactivate={onReactivate}
      />,
    );

    expect(screen.getByText('This sport profile is down. Do you want to bring it up?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Later' }));
    expect(onLater).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Yes' }));
    expect(onReactivate).toHaveBeenCalled();
  });

  it('group mode: names the sport twice', () => {
    render(<ReactivateSportNudgeDialog {...baseProps} mode="group" />);
    expect(
      screen.getByText(
        'This is a Badminton group, but your Badminton profile is down. Do you want to bring it up?',
      ),
    ).toBeInTheDocument();
  });

  it('shows "Bringing it up…" and disables both buttons while reactivating', () => {
    render(<ReactivateSportNudgeDialog {...baseProps} mode="sport-pill" isReactivating />);
    expect(screen.getByRole('button', { name: 'Bringing it up…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Later' })).toBeDisabled();
  });

  it('renders the error alert when isError', () => {
    render(<ReactivateSportNudgeDialog {...baseProps} mode="sport-pill" isError />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't bring Badminton back up");
  });
});
