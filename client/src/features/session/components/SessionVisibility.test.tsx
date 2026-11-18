import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SessionVisibilitySwitch, SessionVisibilityWarning } from './SessionVisibility';

// CLIENT-SESSION-52: the public / private switch and its warning.

describe('SessionVisibilitySwitch', () => {
  it('is a labelled switch, on when the session is public, with the public hint', () => {
    render(<SessionVisibilitySwitch id="v" isPublic onChange={() => {}} />);
    expect(screen.getByRole('switch', { name: 'Public session' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Everyone can see and ask to join your session')).toBeInTheDocument();
    expect(screen.queryByText(/Except for your invitee/)).not.toBeInTheDocument();
  });

  it('is off for a private session, with the private hint', () => {
    render(<SessionVisibilitySwitch id="v" isPublic={false} onChange={() => {}} />);
    expect(screen.getByRole('switch', { name: 'Public session' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Except for your invitee, everyone cannot find and ask to join your session')).toBeInTheDocument();
    expect(screen.queryByText('Everyone can see and ask to join your session')).not.toBeInTheDocument();
  });

  it('asks for the opposite state on a click on the switch', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SessionVisibilitySwitch id="v" isPublic onChange={onChange} />);
    await user.click(screen.getByRole('switch', { name: 'Public session' }));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('a click on the hint toggles too (the whole row is the label)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SessionVisibilitySwitch id="v" isPublic={false} onChange={onChange} />);
    await user.click(screen.getByText(/Except for your invitee/));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('is controlled: it does not change by itself', async () => {
    const user = userEvent.setup();
    render(<SessionVisibilitySwitch id="v" isPublic onChange={() => {}} />);
    await user.click(screen.getByRole('switch', { name: 'Public session' }));
    expect(screen.getByRole('switch', { name: 'Public session' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('SessionVisibilityWarning', () => {
  it('says only the host and the invited friends can see the session, as a status line', () => {
    render(<SessionVisibilityWarning />);
    expect(screen.getByRole('status')).toHaveTextContent(
      "Only you and invited friends can see this session; everyone else won't be able to find it and join.",
    );
  });
});
