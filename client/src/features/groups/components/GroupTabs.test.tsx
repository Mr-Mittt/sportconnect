import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GroupTabs } from './GroupTabs';

describe('GroupTabs', () => {
  it('marks the active tab as selected', () => {
    render(<GroupTabs activeTab="chat" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Posts' })).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onChange when a tab is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<GroupTabs activeTab="posts" onChange={onChange} />);

    await user.click(screen.getByRole('tab', { name: 'Settings' }));
    expect(onChange).toHaveBeenCalledWith('settings');
  });

  it('moves selection with arrow keys', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<GroupTabs activeTab="posts" onChange={onChange} />);

    screen.getByRole('tab', { name: 'Posts' }).focus();
    await user.keyboard('{ArrowDown}');
    expect(onChange).toHaveBeenCalledWith('chat');

    await user.keyboard('{ArrowUp}');
    expect(onChange).toHaveBeenLastCalledWith('posts');
  });

  // GRP-3
  it('renders a Members tab between Chat and Settings and calls onChange when clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<GroupTabs activeTab="posts" onChange={onChange} />);

    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual(['Posts', 'Chat', 'Members', 'Settings']);

    await user.click(screen.getByRole('tab', { name: 'Members' }));
    expect(onChange).toHaveBeenCalledWith('members');
  });
});
