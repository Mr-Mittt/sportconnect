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
    // CLIENT-SESSION-34: title and duration are optional; only the open slot is validated here.
    expect(screen.getByText('Vui lòng nhập số chỗ trống.')).toBeInTheDocument();
  });

  it('renders the new sections, the missing chips, the mood labels and the who-can-join options in Vietnamese', async () => {
    await i18n.changeLanguage('vi');
    renderModal();
    for (const name of [/^Tổng quan/, /^Khi nào/, /^Ở đâu/, /^Ai chơi/, /^Chi phí/]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getByText('Còn thiếu: thời lượng')).toBeInTheDocument();
    expect(screen.getByText('Còn thiếu: địa điểm')).toBeInTheDocument();
    expect(screen.getByText('Còn thiếu: phí')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Bất kỳ ai' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Theo giới tính' })).toBeInTheDocument();
    expect(screen.getByText('5 · Bình thường')).toBeInTheDocument();
    expect(screen.queryByText(/không bắt buộc/)).not.toBeInTheDocument();
  });

  it('renders the auto-approve confirmation and both readiness popups in Vietnamese', async () => {
    await i18n.changeLanguage('vi');
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('checkbox', { name: 'Tự động duyệt yêu cầu tham gia' }));
    expect(screen.getByText('Bật tự động duyệt?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hủy' }));
    await user.type(screen.getByLabelText(/^Chỗ trống/), '5');
    await user.click(screen.getByRole('button', { name: 'Tạo buổi chơi' }));
    expect(screen.getByText('Bạn đã sẵn sàng chưa?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tiếp tục chỉnh sửa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tạo buổi chơi đang chuẩn bị' })).toBeInTheDocument();
  });

  it('renders the leave-without-saving question in Vietnamese', async () => {
    await i18n.changeLanguage('vi');
    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByLabelText(/^Chỗ trống/), '5');
    await user.keyboard('{Escape}');
    expect(screen.getByText('Rời đi mà không lưu?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tiếp tục chỉnh sửa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rời đi' })).toBeInTheDocument();
  });

  it('prefers an override-prefix key over the default copy', () => {
    i18n.addResourceBundle('en', 'sessionOverrideTest', { custom: { create: { title: 'Host a game' } } }, true, true);
    renderModal('sessionOverrideTest:custom');
    expect(screen.getByText('Host a game')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create session' })).toBeInTheDocument(); // falls back
  });
});
