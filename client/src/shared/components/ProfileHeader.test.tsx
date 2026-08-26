import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProfileHeader } from './ProfileHeader';
import type { UserResponse } from '@/features/profile/types';

const baseUser: UserResponse = {
  id: 'user-1',
  email: 'bilal@example.com',
  firstName: 'Bilal',
  lastName: 'Nasser',
  username: 'bnasser',
  phoneNumber: null,
  dateOfBirth: null,
  gender: null,
  bio: 'Midfielder for FC Weekend Warriors.',
  avatarUrl: null,
  coverUrl: null,
  location: null,
  city: 'Riverside',
  country: null,
  heightCm: null,
  weightKg: null,
  shoeSizeCm: null,
  isEmailVerified: true,
  isActive: true,
  roles: ['USER'],
  createdAt: '2026-03-01T00:00:00',
  lastLoginAt: null,
  fullName: 'Bilal Nasser',
};

function renderHeader(overrides: Partial<UserResponse> = {}) {
  const onEditProfile = vi.fn();
  render(<ProfileHeader user={{ ...baseUser, ...overrides }} onEditProfile={onEditProfile} />);
  return { onEditProfile };
}

describe('ProfileHeader', () => {
  it('renders full name, handle, city, and bio', () => {
    renderHeader();
    expect(screen.getByText('Bilal Nasser')).toBeInTheDocument();
    expect(screen.getByText('@bnasser · Riverside')).toBeInTheDocument();
    expect(screen.getByText('Midfielder for FC Weekend Warriors.')).toBeInTheDocument();
  });

  it('falls back to initials when avatarUrl is null', () => {
    renderHeader({ avatarUrl: null });
    expect(screen.getByText('BN')).toBeInTheDocument();
  });

  it('renders no bio paragraph when bio is null', () => {
    renderHeader({ bio: null });
    expect(screen.queryByText('Midfielder for FC Weekend Warriors.')).not.toBeInTheDocument();
  });

  it('renders no bio paragraph when bio is an empty string', () => {
    renderHeader({ bio: '' });
    expect(screen.getByText('Bilal Nasser')).toBeInTheDocument();
    expect(screen.queryByRole('paragraph')).not.toBeInTheDocument();
  });

  it('omits @username from the handle line when username is null', () => {
    renderHeader({ username: null });
    expect(screen.getByText('Riverside')).toBeInTheDocument();
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });

  it('omits city from the handle line when city is null', () => {
    renderHeader({ city: null });
    expect(screen.getByText('@bnasser')).toBeInTheDocument();
  });

  it('renders no handle line at all when both username and city are null', () => {
    renderHeader({ username: null, city: null });
    expect(screen.queryByText(/@|Riverside/)).not.toBeInTheDocument();
  });

  it('calls onEditProfile when the button is clicked', async () => {
    const user = userEvent.setup();
    const { onEditProfile } = renderHeader();

    await user.click(screen.getByRole('button', { name: 'Edit profile' }));

    expect(onEditProfile).toHaveBeenCalledTimes(1);
  });
});
