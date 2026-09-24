import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { JoinFeedbackDialog } from './JoinFeedbackDialog';

describe('JoinFeedbackDialog', () => {
  it('renders nothing while kind is null', () => {
    render(<JoinFeedbackDialog kind={null} onDismiss={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the joined message with a Got it button', () => {
    render(<JoinFeedbackDialog kind="JOINED" onDismiss={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('You successfully joined the session. Enjoy your games!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument();
  });

  it('shows the waiting-for-approval message for a join request', () => {
    render(<JoinFeedbackDialog kind="REQUESTED" onDismiss={vi.fn()} />);
    expect(
      screen.getByText('Waiting for host approval. Feel free to chat while you wait.'),
    ).toBeInTheDocument();
  });

  it('has no visible title — the accessible name comes from an sr-only heading', () => {
    render(<JoinFeedbackDialog kind="JOINED" onDismiss={vi.fn()} />);
    expect(screen.getByText('You joined the session')).toHaveClass('sr-only');
    expect(screen.getByRole('dialog', { name: 'You joined the session' })).toBeInTheDocument();
  });

  it('Got it dismisses', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<JoinFeedbackDialog kind="JOINED" onDismiss={onDismiss} />);
    await user.click(screen.getByRole('button', { name: 'Got it' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('centers the message and the buttons, and the buttons have no background fill', () => {
    render(<JoinFeedbackDialog kind="JOINED" onDismiss={vi.fn()} onOpenSession={vi.fn()} />);
    expect(screen.getByText('You successfully joined the session. Enjoy your games!')).toHaveClass('text-center');
    const gotIt = screen.getByRole('button', { name: 'Got it' });
    expect(gotIt.parentElement).toHaveClass('justify-center');
    for (const button of [gotIt, screen.getByRole('button', { name: 'Open session' })]) {
      expect(button.className).not.toMatch(/(^|\s)bg-(?!transparent)/);
    }
  });

  it('shows no "Open session" button unless onOpenSession is passed', () => {
    const { rerender } = render(<JoinFeedbackDialog kind="JOINED" onDismiss={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Open session' })).not.toBeInTheDocument();
    rerender(<JoinFeedbackDialog kind="JOINED" onDismiss={vi.fn()} onOpenSession={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Open session' })).toBeInTheDocument();
  });

  it('Open session calls onOpenSession, and not onDismiss itself', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const onOpenSession = vi.fn();
    render(<JoinFeedbackDialog kind="REQUESTED" onDismiss={onDismiss} onOpenSession={onOpenSession} />);
    await user.click(screen.getByRole('button', { name: 'Open session' }));
    expect(onOpenSession).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('Escape dismisses too', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<JoinFeedbackDialog kind="REQUESTED" onDismiss={onDismiss} />);
    await user.keyboard('{Escape}');
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
