import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MAX_BIO_LENGTH } from '@/features/profile/types';
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
    avatarUrl: null,
    coverUrl: null,
    location: null,
    city: 'Hanoi',
    country: 'Vietnam',
    heightCm: null,
    weightKg: null,
    shoeSizeCm: null,
    isEmailVerified: true,
    isActive: true,
    roles: ['USER'],
    createdAt: '2026-01-01T00:00:00',
    lastLoginAt: null,
    fullName: 'Jordan Lee',
    ...overrides,
  };
}

describe('EditProfileModal', () => {
  it('renders seeded from the user prop, including the physical-stats fields', () => {
    render(
      <EditProfileModal
        isOpen
        onClose={vi.fn()}
        user={user({ phoneNumber: '0123456789', heightCm: 180, weightKg: 75, shoeSizeCm: 26 })}
        onSave={vi.fn()}
        isSaving={false}
        errorMessage={null}
      />,
    );

    expect(screen.getByLabelText('First name')).toHaveValue('Jordan');
    expect(screen.getByLabelText('Last name')).toHaveValue('Lee');
    expect(screen.getByLabelText('Username')).toHaveValue('jordanlee');
    expect(screen.getByLabelText('Bio')).toHaveValue('Weekend baller.');
    expect(screen.getByLabelText('City')).toHaveValue('Hanoi');
    expect(screen.getByLabelText('Country')).toHaveValue('Vietnam');
    expect(screen.getByLabelText('Phone number')).toHaveValue('0123456789');
    expect(screen.getByLabelText('Height (cm)')).toHaveValue(180);
    expect(screen.getByLabelText('Weight (kg)')).toHaveValue(75);
    expect(screen.getByLabelText('Shoe size (JP, cm)')).toHaveValue(26);
  });

  it('clamps the bio textarea at MAX_BIO_LENGTH', () => {
    render(
      <EditProfileModal
        isOpen
        onClose={vi.fn()}
        user={user({ bio: '' })}
        onSave={vi.fn()}
        isSaving={false}
        errorMessage={null}
      />,
    );

    const bio = screen.getByLabelText('Bio');
    expect(bio).toHaveAttribute('maxLength', String(MAX_BIO_LENGTH));

    fireEvent.change(bio, { target: { value: 'a'.repeat(510) } });

    expect(bio).toHaveValue('a'.repeat(500));
    expect(screen.getByText('500/500')).toBeInTheDocument();
  });

  it('Save is disabled until a field actually changes', async () => {
    const testUser = userEvent.setup();
    const onSave = vi.fn();
    render(
      <EditProfileModal
        isOpen
        onClose={vi.fn()}
        user={user()}
        onSave={onSave}
        isSaving={false}
        errorMessage={null}
      />,
    );

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    await testUser.clear(screen.getByLabelText('City'));
    await testUser.type(screen.getByLabelText('City'), 'Da Nang');

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  it('submit calls onSave with only the changed fields', async () => {
    const testUser = userEvent.setup();
    const onSave = vi.fn();
    render(
      <EditProfileModal
        isOpen
        onClose={vi.fn()}
        user={user()}
        onSave={onSave}
        isSaving={false}
        errorMessage={null}
      />,
    );

    await testUser.clear(screen.getByLabelText('City'));
    await testUser.type(screen.getByLabelText('City'), 'Da Nang');
    await testUser.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSave).toHaveBeenCalledWith({ city: 'Da Nang' });
  });

  it('omits a cleared height/weight/shoe-size/date-of-birth rather than sending it as 0/empty', async () => {
    const testUser = userEvent.setup();
    const onSave = vi.fn();
    render(
      <EditProfileModal
        isOpen
        onClose={vi.fn()}
        user={user({ heightCm: 180, city: 'Hanoi' })}
        onSave={onSave}
        isSaving={false}
        errorMessage={null}
      />,
    );

    await testUser.clear(screen.getByLabelText('Height (cm)'));
    await testUser.clear(screen.getByLabelText('City'));
    await testUser.type(screen.getByLabelText('City'), 'Da Nang');
    await testUser.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSave).toHaveBeenCalledWith({ city: 'Da Nang' });
  });

  it('renders the server error message when passed', () => {
    render(
      <EditProfileModal
        isOpen
        onClose={vi.fn()}
        user={user()}
        onSave={vi.fn()}
        isSaving={false}
        errorMessage="Username must be between 3 and 50 characters"
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Username must be between 3 and 50 characters',
    );
  });
});
