import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/app/i18n';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { CreateSessionModal } from './CreateSessionModal';

// The picker is a closed sibling of the form; its own copy isn't under test here.
vi.mock('@/features/location/components/LocationPicker', () => ({ LocationPicker: () => null }));

const sportsByKey = {
  basketball: { key: 'basketball', label: 'Basketball', iconUrl: '/images/sports/basketball.png', colorRamp: 'coral' },
} as Record<SportKey, SportProfile>;

const noop = () => {};

function renderModal(i18nOverridePrefix?: string) {
  return render(
    <CreateSessionModal
      isOpen
      onClose={noop}
      sportsByKey={sportsByKey}
      selectedLocation={null}
      onOpenLocationPicker={noop}
      locationPicker={{ isOpen: false } as never}
      onEffectiveSportChange={noop}
      favoriteLocations={[]}
      isFavoriteLocationsLoading={false}
      onSelectLocation={noop}
      friends={[]}
      isFriendsLoading={false}
      onSubmit={noop}
      isSubmitting={false}
      isError={false}
      sessionAttributeSchema={null}
      sessionAttributeValues={{}}
      onSessionAttributeChange={noop}
      availableSports={[]}
      onAddSport={noop}
      isAddingSport={false}
      isAddSportError={false}
      i18nOverridePrefix={i18nOverridePrefix}
    />,
  );
}

describe('CreateSessionModal i18n', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders the form and its inline validation errors in Vietnamese', async () => {
    await i18n.changeLanguage('vi');
    const user = userEvent.setup();
    renderModal();
    expect(screen.getByText('Tạo buổi chơi của bạn')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tạo buổi chơi' }));
    expect(screen.getByText('Vui lòng nhập tên buổi chơi.')).toBeInTheDocument();
    expect(screen.getByText('Vui lòng nhập thời lượng.')).toBeInTheDocument();
    expect(screen.getByText('Vui lòng nhập số chỗ trống.')).toBeInTheDocument();
  });

  it('prefers an override-prefix key over the default copy', () => {
    i18n.addResourceBundle('en', 'sessionOverrideTest', { custom: { create: { title: 'Host a game' } } }, true, true);
    renderModal('sessionOverrideTest:custom');
    expect(screen.getByText('Host a game')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create session' })).toBeInTheDocument(); // falls back
  });
});
