import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/app/i18n';
import type { UserResponse } from '@/features/profile/types';
import { EditProfileModal } from './EditProfileModal';

function user(overrides: Partial<UserResponse> = {}): UserResponse {
  return {
    id: 'user-1',
    email: 'jordan@example.com',
    firstName: 'Jordan',
    lastName: 'Lee',
    username: 'jordanlee',
    phoneNumber: null,
    dateOfBirth: null,
    gender: null,
    bio: 'Weekend baller.',
    avatarUrl: 'https://cdn.example.com/avatar.png',
    coverUrl: null,
    location: null,
    city: 'Hanoi',
    country: 'Vietnam',
    countryId: 1,
    regionId: 101,
    regionName: 'Hanoi',
    heightCm: null,
    weightKg: null,
    shoeSizeMm: null,
    isEmailVerified: true,
    isActive: true,
    roles: ['USER'],
    createdAt: '2026-01-01T00:00:00',
    lastLoginAt: null,
    fullName: 'Jordan Lee',
    ...overrides,
  };
}

function renderModal(overrides: Partial<React.ComponentProps<typeof EditProfileModal>> = {}) {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    user: user(),
    onSave: vi.fn(),
    isSaving: false,
    errorMessage: null,
    ...overrides,
  };
  render(<EditProfileModal {...props} />);
  return props;
}

describe('EditProfileModal', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('offers only the avatar and cover URL fields, seeded from the user', () => {
    renderModal();

    expect(screen.getByLabelText('Avatar URL')).toHaveValue('https://cdn.example.com/avatar.png');
    expect(screen.getByLabelText('Cover URL')).toHaveValue('');
    // Everything else moved to AccountSettingsModal (ACCOUNT-1).
    expect(screen.queryByLabelText('First name')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Bio')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Country')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Language')).not.toBeInTheDocument();
  });

  it('Save is disabled until a field actually changes', async () => {
    const testUser = userEvent.setup();
    renderModal();

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await testUser.type(screen.getByLabelText('Cover URL'), 'x');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  it('submit calls onSave with only the changed field', async () => {
    const testUser = userEvent.setup();
    const { onSave } = renderModal();

    await testUser.type(screen.getByLabelText('Cover URL'), 'https://cdn.example.com/cover.png');
    await testUser.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSave).toHaveBeenCalledWith({ coverUrl: 'https://cdn.example.com/cover.png' });
  });

  it('renders the server error message when passed', () => {
    renderModal({ errorMessage: 'Could not save' });

    expect(screen.getByRole('alert')).toHaveTextContent('Could not save');
  });

  it('renders Vietnamese copy', async () => {
    await i18n.changeLanguage('vi');
    renderModal();

    expect(screen.getByRole('dialog', { name: 'Chỉnh sửa hồ sơ' })).toBeInTheDocument();
    expect(screen.getByLabelText('URL ảnh đại diện')).toBeInTheDocument();
    expect(screen.getByLabelText('URL ảnh bìa')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeInTheDocument();
  });
});
