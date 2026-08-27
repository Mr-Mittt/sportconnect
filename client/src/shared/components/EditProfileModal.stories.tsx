import type { Meta, StoryObj } from '@storybook/react-vite';
import type { UserResponse } from '@/features/profile/types';
import { EditProfileModal } from './EditProfileModal';

const baseUser: UserResponse = {
  id: 'user-1',
  email: 'jordan@example.com',
  firstName: 'Jordan',
  lastName: 'Lee',
  username: 'jordanlee',
  phoneNumber: '0123456789',
  dateOfBirth: '1995-06-12',
  gender: 'Female',
  bio: 'Weekend baller, always up for a pickup game.',
  avatarUrl: null,
  coverUrl: null,
  location: null,
  city: 'Hanoi',
  country: 'Vietnam',
  heightCm: 170,
  weightKg: 62,
  shoeSizeCm: 24,
  isEmailVerified: true,
  isActive: true,
  roles: ['USER'],
  createdAt: '2026-01-01T00:00:00',
  lastLoginAt: null,
  fullName: 'Jordan Lee',
};

const meta = {
  title: 'Shared/EditProfileModal',
  component: EditProfileModal,
  args: {
    isOpen: true,
    onClose: () => {},
    user: baseUser,
    onSave: () => {},
    isSaving: false,
    errorMessage: null,
  },
} satisfies Meta<typeof EditProfileModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Every optional field unset — the empty-state layout. */
export const EmptyProfile: Story = {
  args: {
    user: {
      ...baseUser,
      firstName: null,
      lastName: null,
      username: null,
      phoneNumber: null,
      dateOfBirth: null,
      gender: null,
      bio: null,
      city: null,
      country: null,
      heightCm: null,
      weightKg: null,
      shoeSizeCm: null,
    },
  },
};

export const Saving: Story = {
  args: { isSaving: true },
};

export const ErrorState: Story = {
  args: { errorMessage: 'Username must be between 3 and 50 characters' },
};
