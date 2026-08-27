import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { UserSportProfileResponse } from '@/shared/types/sport';
import type { SportProfileEditDraft } from '../sportProfileEditDraft';
import { SportProfileSettingsTab } from './SportProfileSettingsTab';

function profile(overrides: Partial<UserSportProfileResponse> = {}): UserSportProfileResponse {
  return {
    id: 1,
    userId: 'user-1',
    sportId: 5,
    sportName: 'Football',
    skillLevel: 'beginner',
    yearsOfExperience: null,
    preferredPosition: null,
    bio: null,
    attributes: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00',
    updatedAt: '2026-01-01T00:00:00',
    ...overrides,
  };
}

function draft(overrides: Partial<SportProfileEditDraft> = {}): SportProfileEditDraft {
  return {
    skillLevel: 'beginner',
    yearsOfExperience: '',
    preferredPosition: '',
    attributes: {},
    ...overrides,
  };
}

const baseProps = {
  isLoading: false,
  schema: null,
  setSkillLevel: vi.fn(),
  setYearsOfExperience: vi.fn(),
  setPreferredPosition: vi.fn(),
  setAttribute: vi.fn(),
  onSave: vi.fn(),
  isSaving: false,
  errorMessage: null,
};

describe('SportProfileSettingsTab', () => {
  it('renders nothing while loading', () => {
    const { container } = render(
      <SportProfileSettingsTab
        {...baseProps}
        activeProfile={undefined}
        isLoading
        draft={draft()}
        isDirty={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the empty state for a caller with zero sport profiles', () => {
    render(
      <SportProfileSettingsTab {...baseProps} activeProfile={undefined} draft={draft()} isDirty={false} />,
    );
    expect(screen.getByText(/add a sport above/i)).toBeInTheDocument();
  });

  it('renders seeded from the draft', () => {
    render(
      <SportProfileSettingsTab
        {...baseProps}
        activeProfile={profile()}
        draft={draft({ skillLevel: 'advanced', yearsOfExperience: '5', preferredPosition: 'Striker' })}
        isDirty={false}
      />,
    );
    expect(screen.getByLabelText('Skill level')).toHaveValue('advanced');
    expect(screen.getByLabelText('Years of experience')).toHaveValue(5);
    expect(screen.getByLabelText('Preferred position')).toHaveValue('Striker');
  });

  it('Save is disabled until isDirty is true, and disabled while skill level is empty', () => {
    const { rerender } = render(
      <SportProfileSettingsTab {...baseProps} activeProfile={profile()} draft={draft()} isDirty={false} />,
    );
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    rerender(
      <SportProfileSettingsTab {...baseProps} activeProfile={profile()} draft={draft()} isDirty />,
    );
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();

    rerender(
      <SportProfileSettingsTab
        {...baseProps}
        activeProfile={profile()}
        draft={draft({ skillLevel: '' })}
        isDirty
      />,
    );
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('calls onSave when the form is submitted', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <SportProfileSettingsTab
        {...baseProps}
        onSave={onSave}
        activeProfile={profile()}
        draft={draft()}
        isDirty
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSave).toHaveBeenCalled();
  });

  it('calls setPreferredPosition as the field is edited', async () => {
    const user = userEvent.setup();
    const setPreferredPosition = vi.fn();
    render(
      <SportProfileSettingsTab
        {...baseProps}
        setPreferredPosition={setPreferredPosition}
        activeProfile={profile()}
        draft={draft()}
        isDirty={false}
      />,
    );

    await user.type(screen.getByLabelText('Preferred position'), 'W');

    expect(setPreferredPosition).toHaveBeenCalledWith('W');
  });

  it('renders the server error message when errorMessage is set', () => {
    render(
      <SportProfileSettingsTab
        {...baseProps}
        errorMessage="Could not save your sport profile. Please try again."
        activeProfile={profile()}
        draft={draft()}
        isDirty
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save your sport profile');
  });
});
