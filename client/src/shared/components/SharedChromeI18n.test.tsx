import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/app/i18n';
import { DefinitionFields } from '@/shared/components/attributeFields/DefinitionFields';
import { LocationPicker } from '@/features/location/components/LocationPicker';
import { ProfileHeader } from '@/shared/components/ProfileHeader';
import type { UserResponse } from '@/features/profile/types';
import type { Location } from '@/features/location/types';
import type { ResolvedSportAttributeDefinitionType } from '@/shared/types/sport';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';

/**
 * CLIENT-I18N-12: Vietnamese rendering + override-prefix behavior for the shared/nested pieces
 * the per-page I18N tickets missed. English output is covered by each component's own test file.
 */
const noop = () => {};
const pickerProps = {
  isOpen: true,
  onClose: noop,
  mode: 'search' as const,
  onSwitchToCreate: noop,
  onSwitchToSearch: noop,
  inputValue: '',
  onInputChange: noop,
  onSearch: noop,
  results: [] as Location[],
  isSearching: false,
  isSearchError: false,
  onSelectResult: noop,
  favoriteLocationIds: new Set<number>(),
  onToggleFavorite: noop,
  isTogglingFavorite: false,
  onOpenGoogleMaps: noop,
  mapsUrlInput: '',
  onMapsUrlChange: noop,
  onResolveUrl: noop,
  isResolving: false,
  isResolveError: false,
  resolvedNoCoordinates: false,
  coordinates: null,
  mapSeed: 0,
  onMovePin: noop,
  name: '',
  onNameChange: noop,
  address: '',
  onAddressChange: noop,
  canSave: false,
  onSave: noop,
  isSaving: false,
  isSaveError: false,
};

describe('Shared chrome i18n (CLIENT-I18N-12)', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('LocationPicker search mode renders Vietnamese', async () => {
    await i18n.changeLanguage('vi');
    render(<LocationPicker {...pickerProps} />);
    expect(screen.getByText('Chọn địa điểm')).toBeInTheDocument();
    expect(screen.getByLabelText('Tìm địa điểm')).toHaveAttribute(
      'placeholder',
      'Tìm địa điểm theo tên…',
    );
    expect(screen.getByText('Không tìm thấy địa điểm nào.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Không tìm thấy? Thêm địa điểm mới' })).toBeInTheDocument();
  });

  it('LocationPicker interpolates the favorite label in Vietnamese', async () => {
    await i18n.changeLanguage('vi');
    const location = { id: 1, name: 'Sân A', address: null } as Location;
    render(<LocationPicker {...pickerProps} results={[location]} />);
    expect(screen.getByRole('button', { name: 'Yêu thích Sân A' })).toBeInTheDocument();
  });

  it('LocationPicker create mode renders Vietnamese', async () => {
    await i18n.changeLanguage('vi');
    render(<LocationPicker {...pickerProps} mode="create" isSaveError />);
    expect(screen.getByText('Thêm địa điểm mới')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Quay lại tìm kiếm/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Dán liên kết chia sẻ')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Không lưu được địa điểm này. Hãy thử lại.');
    expect(screen.getByRole('button', { name: 'Lưu & dùng địa điểm này' })).toBeInTheDocument();
  });

  it('LocationPicker prefers an override-prefix key and falls back for the rest', () => {
    i18n.addResourceBundle(
      'en',
      'locationOverrideTest',
      { custom: { locationPicker: { chooseTitle: 'Pick a venue' } } },
      true,
      true,
    );
    render(<LocationPicker {...pickerProps} i18nOverridePrefix="locationOverrideTest:custom" />);
    expect(screen.getByText('Pick a venue')).toBeInTheDocument();
    expect(screen.getByLabelText('Search locations')).toBeInTheDocument();
  });

  it('DialogHeader close button renders Vietnamese', async () => {
    await i18n.changeLanguage('vi');
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader title="T" />
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole('button', { name: 'Đóng' })).toBeInTheDocument();
  });

  it('ProfileHeader renders the Vietnamese edit button', async () => {
    await i18n.changeLanguage('vi');
    const user = { fullName: 'Bilal Nasser', avatarUrl: null, bio: null } as UserResponse;
    render(<ProfileHeader user={user} onEditProfile={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Chỉnh sửa hồ sơ' })).toBeInTheDocument();
  });

  it('DefinitionFields renders the Vietnamese required hint', async () => {
    await i18n.changeLanguage('vi');
    const definitionType: ResolvedSportAttributeDefinitionType = {
      name: 'Ref',
      fields: [{ type: 'STRING', key: 'name', label: 'Name', isRequired: true }],
    };
    render(
      <DefinitionFields
        definitionType={definitionType}
        record={{}}
        onChange={vi.fn()}
        definitionsByName={new Map()}
      />,
    );
    expect(screen.getByText('Bắt buộc')).toBeInTheDocument();
  });
});
