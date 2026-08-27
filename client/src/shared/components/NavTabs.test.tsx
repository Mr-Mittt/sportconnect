import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NavTabs } from './NavTabs';

describe('NavTabs', () => {
  it('renders all five tabs with the active one marked aria-current="page"', () => {
    render(<NavTabs active="groups" onChange={() => {}} />);
    for (const label of ['Home', 'Friends', 'Groups', 'Matches', 'Profile']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Groups' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('clicking a tab calls onChange with that tab key', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NavTabs active="home" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Matches' }));
    expect(onChange).toHaveBeenCalledWith('matches');
  });

  it('tabs are keyboard operable (Tab to focus, Enter to activate)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NavTabs active="home" onChange={onChange} />);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Home' })).toHaveFocus();
    await user.tab();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('groups');
  });
});
