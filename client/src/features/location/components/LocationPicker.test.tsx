import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Location } from '../types';
import { LocationPicker } from './LocationPicker';

function location(overrides: Partial<Location>): Location {
  return {
    id: 1,
    sportId: 1,
    sportName: 'Football',
    name: 'Riverside Sports Complex',
    address: '123 Main St',
    latitude: 21.0285,
    longitude: 105.8542,
    sourceMapsUrl: null,
    claimedByVendorId: null,
    createdBy: 'user-1',
    createdAt: '2026-07-30T00:00:00',
    updatedAt: '2026-07-30T00:00:00',
    ...overrides,
  };
}

const baseProps = {
  isOpen: true,
  onClose: () => {},
  mode: 'search' as const,
  onSwitchToCreate: () => {},
  onSwitchToSearch: () => {},
  inputValue: '',
  onInputChange: () => {},
  onSearch: () => {},
  results: [] as Location[],
  isSearching: false,
  isSearchError: false,
  onSelectResult: () => {},
  favoriteLocationIds: new Set<number>(),
  onToggleFavorite: () => {},
  isTogglingFavorite: false,
  onOpenGoogleMaps: () => {},
  mapsUrlInput: '',
  onMapsUrlChange: () => {},
  onResolveUrl: () => {},
  isResolving: false,
  isResolveError: false,
  resolvedNoCoordinates: false,
  coordinates: null as { latitude: number; longitude: number } | null,
  mapSeed: 0,
  onMovePin: () => {},
  name: '',
  onNameChange: () => {},
  address: '',
  onAddressChange: () => {},
  canSave: false,
  onSave: () => {},
  isSaving: false,
  isSaveError: false,
};

describe('LocationPicker — search mode', () => {
  it('calls onInputChange as the user types', async () => {
    const user = userEvent.setup();
    const onInputChange = vi.fn();
    render(<LocationPicker {...baseProps} onInputChange={onInputChange} />);
    await user.type(screen.getByLabelText('Search locations'), 'a');
    expect(onInputChange).toHaveBeenCalledWith('a');
  });

  it('calls onSearch when pressing Enter or clicking Search', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(<LocationPicker {...baseProps} onSearch={onSearch} />);
    await user.type(screen.getByLabelText('Search locations'), '{Enter}');
    expect(onSearch).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /Search/ }));
    expect(onSearch).toHaveBeenCalledTimes(2);
  });

  it('renders result rows and calls onSelectResult with the clicked location', async () => {
    const user = userEvent.setup();
    const onSelectResult = vi.fn();
    const first = location({ id: 1, name: 'Riverside Sports Complex' });
    render(<LocationPicker {...baseProps} results={[first]} onSelectResult={onSelectResult} />);
    await user.click(screen.getByText('Riverside Sports Complex'));
    expect(onSelectResult).toHaveBeenCalledWith(first);
  });

  it('shows a heart-toggle per row that calls onToggleFavorite without also selecting the row', async () => {
    const user = userEvent.setup();
    const onSelectResult = vi.fn();
    const onToggleFavorite = vi.fn();
    const first = location({ id: 1, name: 'Riverside Sports Complex' });
    render(
      <LocationPicker
        {...baseProps}
        results={[first]}
        onSelectResult={onSelectResult}
        onToggleFavorite={onToggleFavorite}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Favorite Riverside Sports Complex' }));
    expect(onToggleFavorite).toHaveBeenCalledWith(first);
    expect(onSelectResult).not.toHaveBeenCalled();
  });

  it('labels an already-favorited row for unfavoriting, and reflects the filled state', () => {
    const favorited = location({ id: 1, name: 'Riverside Sports Complex' });
    render(
      <LocationPicker {...baseProps} results={[favorited]} favoriteLocationIds={new Set([1])} />,
    );
    const heart = screen.getByRole('button', { name: 'Unfavorite Riverside Sports Complex' });
    expect(heart).toHaveAttribute('aria-pressed', 'true');
  });

  it('disables every heart-toggle while a favorite mutation is in flight', () => {
    const first = location({ id: 1, name: 'Riverside Sports Complex' });
    render(<LocationPicker {...baseProps} results={[first]} isTogglingFavorite />);
    expect(screen.getByRole('button', { name: 'Favorite Riverside Sports Complex' })).toBeDisabled();
  });

  it('shows loading/error/empty states', () => {
    const { rerender } = render(<LocationPicker {...baseProps} isSearching />);
    expect(screen.getByText('Searching…')).toBeInTheDocument();

    rerender(<LocationPicker {...baseProps} isSearchError />);
    expect(screen.getByText("Couldn't load locations.")).toBeInTheDocument();

    rerender(<LocationPicker {...baseProps} />);
    expect(screen.getByText('No locations found.')).toBeInTheDocument();
  });

  it('calls onSwitchToCreate from the "Add a new location" link', async () => {
    const user = userEvent.setup();
    const onSwitchToCreate = vi.fn();
    render(<LocationPicker {...baseProps} onSwitchToCreate={onSwitchToCreate} />);
    await user.click(screen.getByRole('button', { name: /Add a new location/ }));
    expect(onSwitchToCreate).toHaveBeenCalledTimes(1);
  });
});

describe('LocationPicker — create mode', () => {
  const createProps = { ...baseProps, mode: 'create' as const };

  it('calls onSwitchToSearch from the back link', async () => {
    const user = userEvent.setup();
    const onSwitchToSearch = vi.fn();
    render(<LocationPicker {...createProps} onSwitchToSearch={onSwitchToSearch} />);
    await user.click(screen.getByRole('button', { name: /Back to search/ }));
    expect(onSwitchToSearch).toHaveBeenCalledTimes(1);
  });

  it('calls onOpenGoogleMaps from "Find on Google Maps"', async () => {
    const user = userEvent.setup();
    const onOpenGoogleMaps = vi.fn();
    render(<LocationPicker {...createProps} onOpenGoogleMaps={onOpenGoogleMaps} />);
    await user.click(screen.getByRole('button', { name: /Find on Google Maps/ }));
    expect(onOpenGoogleMaps).toHaveBeenCalledTimes(1);
  });

  it('calls onMapsUrlChange as the user pastes a link', async () => {
    const user = userEvent.setup();
    const onMapsUrlChange = vi.fn();
    render(<LocationPicker {...createProps} onMapsUrlChange={onMapsUrlChange} />);
    await user.type(screen.getByPlaceholderText('https://maps.app.goo.gl/…'), 'h');
    expect(onMapsUrlChange).toHaveBeenCalledWith('h');
  });

  it('calls onResolveUrl when clicking Resolve', async () => {
    const user = userEvent.setup();
    const onResolveUrl = vi.fn();
    render(
      <LocationPicker {...createProps} mapsUrlInput="https://maps.app.goo.gl/abc" onResolveUrl={onResolveUrl} />,
    );
    await user.click(screen.getByRole('button', { name: 'Resolve' }));
    expect(onResolveUrl).toHaveBeenCalledTimes(1);
  });

  it('disables Resolve while the link input is empty', () => {
    render(<LocationPicker {...createProps} mapsUrlInput="" />);
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeDisabled();
  });

  it('shows "Resolving…" while a resolve is in flight', () => {
    render(<LocationPicker {...createProps} mapsUrlInput="https://maps.app.goo.gl/abc" isResolving />);
    expect(screen.getByRole('button', { name: 'Resolving…' })).toBeInTheDocument();
  });

  it('shows a resolve error message', () => {
    render(<LocationPicker {...createProps} isResolveError />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't resolve that link");
  });

  it('shows a fallback message when resolve found no coordinates', () => {
    render(<LocationPicker {...createProps} resolvedNoCoordinates />);
    expect(screen.getByText(/Couldn't detect coordinates/)).toBeInTheDocument();
  });

  it('renders the map preview and a Get Directions deep link once coordinates exist', () => {
    render(<LocationPicker {...createProps} coordinates={{ latitude: 21.0285, longitude: 105.8542 }} />);
    expect(screen.getByTestId('location-map-preview')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Get Directions/ })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&destination=21.0285,105.8542',
    );
  });

  it('does not render the map preview or Get Directions without coordinates', () => {
    render(<LocationPicker {...createProps} coordinates={null} />);
    expect(screen.queryByTestId('location-map-preview')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Get Directions/ })).not.toBeInTheDocument();
  });

  it('calls onNameChange/onAddressChange as the user edits the fields', async () => {
    const user = userEvent.setup();
    const onNameChange = vi.fn();
    const onAddressChange = vi.fn();
    render(<LocationPicker {...createProps} onNameChange={onNameChange} onAddressChange={onAddressChange} />);
    await user.type(screen.getByLabelText('Name'), 'R');
    expect(onNameChange).toHaveBeenCalledWith('R');
    await user.type(screen.getByLabelText('Address (optional)'), 'M');
    expect(onAddressChange).toHaveBeenCalledWith('M');
  });

  it('disables Save until canSave, and calls onSave when clicked', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const { rerender } = render(<LocationPicker {...createProps} canSave={false} onSave={onSave} />);
    expect(screen.getByRole('button', { name: 'Save & Use This Location' })).toBeDisabled();

    rerender(<LocationPicker {...createProps} canSave onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: 'Save & Use This Location' }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('shows "Saving…" while the create mutation is in flight', () => {
    render(<LocationPicker {...createProps} canSave isSaving />);
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeInTheDocument();
  });

  it('shows a save error message', () => {
    render(<LocationPicker {...createProps} isSaveError />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save this location");
  });
});
