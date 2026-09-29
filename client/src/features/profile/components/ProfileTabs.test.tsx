import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import i18n from '@/app/i18n';
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

  // CLIENT-I18N-6: set and restore the locale explicitly — don't rely on a global reset.
  it('renders Vietnamese copy when the locale is vi', async () => {
    await i18n.changeLanguage('vi');
        render(<ProfileTabs activeTab="posts" onChange={() => {}} />);
    expect(screen.getByRole('tablist', { name: 'Các mục hồ sơ' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Bài viết' })).toBeInTheDocument();
    await i18n.changeLanguage('en');
  });

  it('prefers an override-prefix key over the default copy', async () => {
    await i18n.changeLanguage('en');
    i18n.addResourceBundle('en', 'profileOverrideTest', { custom: { tabs: { posts: 'My writing' } } }, true, true);
    render(<ProfileTabs activeTab="posts" onChange={() => {}} i18nOverridePrefix="profileOverrideTest:custom" />);
    expect(screen.getByRole('tab', { name: 'My writing' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Settings' })).toBeInTheDocument();
  });
});
