import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Group } from '@/features/feed/types';
import type { SportProfile } from '@/shared/types/sport';
import { GroupCoverBanner } from './GroupCoverBanner';

const group: Group = {
  id: 1,
  sportId: 5,
  groupName: 'Riverside Ballers',
  description: null,
  avatarUrl: null,
  coverUrl: null,
  isPrivate: false,
  isActive: true,
  createdBy: 'user-1',
  createdByFullName: 'Jordan Lee',
  memberCount: 42,
  currentUserRole: 'group_member',
  createdAt: '2026-07-15T00:00:00',
  updatedAt: '2026-07-15T00:00:00',
  pinnedPosts: null,
};

const sport: SportProfile = { key: 'football', label: 'Football', iconUrl: '/images/sports/football.png', colorRamp: 'teal' };

describe('GroupCoverBanner', () => {
  it('renders the group name and member count', () => {
    render(<GroupCoverBanner group={group} sport={sport} onBack={() => {}} />);
    expect(screen.getByText('Riverside Ballers')).toBeInTheDocument();
    expect(screen.getByText('42 members')).toBeInTheDocument();
  });

  it('falls back to initials when the sport is unresolved', () => {
    render(<GroupCoverBanner group={group} sport={undefined} onBack={() => {}} />);
    expect(screen.getByText('R')).toBeInTheDocument();
  });

  it('calls onBack when "All groups" is clicked', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<GroupCoverBanner group={group} sport={sport} onBack={onBack} />);
    await user.click(screen.getByRole('button', { name: /all groups/i }));
    expect(onBack).toHaveBeenCalled();
  });

  it('renders the real cover photo when coverUrl is set', () => {
    const { container } = render(
      <GroupCoverBanner
        group={{ ...group, coverUrl: 'https://example.com/riverside-cover.jpg' }}
        sport={sport}
        onBack={() => {}}
      />,
    );
    // Decorative image (alt="") has role "presentation", not "img" — query
    // by tag directly rather than getByRole. `.object-cover` distinguishes
    // the cover photo from the sport icon's own <img> (SPORT-4).
    const img = container.querySelector('img.object-cover');
    expect(img).toHaveAttribute('src', 'https://example.com/riverside-cover.jpg');
  });

  it('renders no cover-photo image element when coverUrl is null (the sport icon\'s own <img> still renders)', () => {
    const { container } = render(<GroupCoverBanner group={group} sport={sport} onBack={() => {}} />);
    expect(container.querySelector('img.object-cover')).not.toBeInTheDocument();
    expect(container.querySelector('img')).toHaveAttribute('src', sport.iconUrl);
  });
});
