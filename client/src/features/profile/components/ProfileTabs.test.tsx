import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProfileTabs } from './ProfileTabs';

describe('ProfileTabs', () => {
  it('marks the active tab as selected', () => {
    render(<ProfileTabs activeTab="memories" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Memories' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Posts' })).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onChange when a tab is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ProfileTabs activeTab="posts" onChange={onChange} />);

    await user.click(screen.getByRole('tab', { name: 'Settings' }));
    expect(onChange).toHaveBeenCalledWith('settings');
  });

  it('moves selection with arrow keys', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ProfileTabs activeTab="posts" onChange={onChange} />);

    screen.getByRole('tab', { name: 'Posts' }).focus();
    await user.keyboard('{ArrowDown}');
    expect(onChange).toHaveBeenCalledWith('memories');

    await user.keyboard('{ArrowUp}');
    expect(onChange).toHaveBeenLastCalledWith('posts');
  });

  it('renders Posts, Memories, Settings in order', () => {
    render(<ProfileTabs activeTab="posts" onChange={() => {}} />);
    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual(['Posts', 'Memories', 'Settings']);
  });
});
