import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/app/i18n';
import { NotificationBell } from './components/NotificationBell';
import { NotificationRow } from './components/NotificationRow';
import type { Notification } from './types';

/**
 * CLIENT-I18N-9: Vietnamese rendering + override-prefix behavior for the bell dropdown's own
 * copy. English output is covered by each component's existing test file.
 */
const unreadNotification: Notification = {
  id: 1,
  type: 'session.comment.created',
  entityType: 'SESSION',
  entityId: '42',
  actorIds: ['actor-1'],
  actorCount: 1,
  isRead: false,
  createdAt: '2026-08-18T09:00:00',
  updatedAt: '2026-08-18T09:00:00',
  actors: [{ id: 'actor-1', fullName: 'Alice Nguyen' }],
  entityTitle: 'Friday Pickup Game',
};

function bellProps(overrides = {}) {
  return {
    unreadCount: 0,
    isOpen: true,
    onOpenChange: vi.fn(),
    notifications: [] as Notification[],
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    onLoadMore: vi.fn(),
    onSelect: vi.fn(),
    hasUnreadLoaded: false,
    onMarkAllRead: vi.fn(),
    isMarkingAllRead: false,
    ...overrides,
  };
}

describe('Notifications feature i18n', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('NotificationBell renders Vietnamese copy in the empty state', async () => {
    await i18n.changeLanguage('vi');
    render(<NotificationBell {...bellProps()} />);
    expect(screen.getByRole('button', { name: 'Thông báo' })).toBeInTheDocument();
    expect(screen.getByText('Bạn đã xem hết thông báo.')).toBeInTheDocument();
  });

  it('NotificationBell interpolates the unread count and translates actions (vi)', async () => {
    await i18n.changeLanguage('vi');
    render(
      <NotificationBell
        {...bellProps({
          unreadCount: 3,
          hasUnreadLoaded: true,
          hasNextPage: true,
          notifications: [unreadNotification],
        })}
      />,
    );
    expect(screen.getByLabelText('3 thông báo chưa đọc')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đánh dấu tất cả đã đọc' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tải thêm' })).toBeInTheDocument();
    expect(screen.getByText('Chưa đọc')).toBeInTheDocument();
  });

  it('NotificationBell shows the Vietnamese load error', async () => {
    await i18n.changeLanguage('vi');
    render(<NotificationBell {...bellProps({ isError: true })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Không thể tải thông báo.');
  });

  it('NotificationBell prefers an override-prefix key and forwards it to rows', () => {
    i18n.addResourceBundle(
      'en',
      'notificationsOverrideTest',
      { custom: { bell: { markAllRead: 'Clear all' }, row: { unread: 'New' } } },
      true,
      true,
    );
    render(
      <NotificationBell
        {...bellProps({ hasUnreadLoaded: true, notifications: [unreadNotification] })}
        i18nOverridePrefix="notificationsOverrideTest:custom"
      />,
    );
    expect(screen.getByRole('button', { name: 'Clear all' })).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument(); // un-overridden key falls back
  });

  it('NotificationRow renders the Vietnamese unread marker', async () => {
    await i18n.changeLanguage('vi');
    render(<NotificationRow notification={unreadNotification} onSelect={vi.fn()} />);
    expect(screen.getByText('Chưa đọc')).toBeInTheDocument();
  });
});
