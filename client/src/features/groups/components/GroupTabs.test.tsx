import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GroupTabs } from './GroupTabs';
import i18n from '@/app/i18n';

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

  // CLIENT-I18N-7: set and restore the locale explicitly — don't rely on a global reset.
  it('renders Vietnamese copy when the locale is vi', async () => {
    await i18n.changeLanguage('vi');
    render(<GroupTabs activeTab="posts" onChange={() => {}} />);
    expect(screen.getByRole('tablist', { name: 'Các mục của nhóm' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Trò chuyện' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Cài đặt' })).toBeInTheDocument();
    await i18n.changeLanguage('en');
  });

  it('prefers an override-prefix key over the default copy', async () => {
    await i18n.changeLanguage('en');
    i18n.addResourceBundle('en', 'groupsOverrideTest', { custom: { tabs: { posts: 'My writing' } } }, true, true);
    render(<GroupTabs activeTab="posts" onChange={() => {}} i18nOverridePrefix="groupsOverrideTest:custom" />);
    expect(screen.getByRole('tab', { name: 'My writing' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Chat' })).toBeInTheDocument(); // un-overridden key falls back
  });

});
