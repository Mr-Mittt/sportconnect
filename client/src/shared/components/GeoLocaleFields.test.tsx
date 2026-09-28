import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { CountryResponse, LanguageResponse, RegionResponse } from '@/shared/types/reference';
import { GeoLocaleFields, type GeoLocaleFieldsProps } from './GeoLocaleFields';

const languages: LanguageResponse[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
];
const vietnam: CountryResponse = { id: 1, iso2: 'VN', iso3: 'VNM', name: 'Vietnam', defaultLanguageCode: 'vi' };
const singapore: CountryResponse = { id: 2, iso2: 'SG', iso3: 'SGP', name: 'Singapore', defaultLanguageCode: null };
const countries: CountryResponse[] = [vietnam, singapore];
const hcmc: RegionResponse = { id: 101, countryId: 1, isoCode: 'VN-SG', name: 'Ho Chi Minh City', nativeName: 'Hồ Chí Minh' };
const regions: RegionResponse[] = [hcmc];

const baseProps: GeoLocaleFieldsProps = {
  languages,
  countries,
  regions: [],
  isReferenceError: false,
  isRegionsError: false,
  languageCode: null,
  countryId: null,
  regionId: null,
  onLanguageChange: () => {},
  onCountryChange: () => {},
  onRegionChange: () => {},
  isGeolocationSupported: true,
  isRequestingLocation: false,
  geoHint: null,
  onUseMyLocation: () => {},
};

describe('GeoLocaleFields', () => {
  it('renders the three labelled selects, all empty by default', () => {
    render(<GeoLocaleFields {...baseProps} />);
    expect(screen.getByLabelText('Language')).toHaveValue('');
    expect(screen.getByLabelText('Country')).toHaveValue('');
    expect(screen.getByLabelText('Region')).toHaveValue('');
  });

  it('lists language options by nativeName and country options by their localized display name', () => {
    render(<GeoLocaleFields {...baseProps} />);
    expect(screen.getByRole('option', { name: 'English' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Tiếng Việt' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Vietnam' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Singapore' })).toBeInTheDocument();
  });

  it('reflects pre-filled values', () => {
    render(<GeoLocaleFields {...baseProps} languageCode="vi" countryId={1} regionId={101} regions={regions} />);
    expect(screen.getByLabelText('Language')).toHaveValue('vi');
    expect(screen.getByLabelText('Country')).toHaveValue('1');
    expect(screen.getByLabelText('Region')).toHaveValue('101');
  });

  it('calls onLanguageChange/onCountryChange/onRegionChange on selection', async () => {
    const user = userEvent.setup();
    const onLanguageChange = vi.fn();
    const onCountryChange = vi.fn();
    const onRegionChange = vi.fn();
    render(
      <GeoLocaleFields
        {...baseProps}
        countryId={1}
        regions={regions}
        onLanguageChange={onLanguageChange}
        onCountryChange={onCountryChange}
        onRegionChange={onRegionChange}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Language'), 'en');
    expect(onLanguageChange).toHaveBeenCalledWith('en');

    await user.selectOptions(screen.getByLabelText('Country'), '2');
    expect(onCountryChange).toHaveBeenCalledWith(2);

    await user.selectOptions(screen.getByLabelText('Region'), '101');
    expect(onRegionChange).toHaveBeenCalledWith(101);
  });

  it('shows a disabled region select with an explanatory label for a country with no regions', () => {
    render(<GeoLocaleFields {...baseProps} countryId={2} regions={[]} />);
    expect(screen.getByLabelText('Region')).toBeDisabled();
    expect(screen.getByText('No regions available for this country')).toBeInTheDocument();
  });

  it('disables the region select when no country is selected yet', () => {
    render(<GeoLocaleFields {...baseProps} countryId={null} regions={[]} />);
    expect(screen.getByLabelText('Region')).toBeDisabled();
  });

  it('renders all three selects disabled with an error hint when reference data failed to load', () => {
    render(<GeoLocaleFields {...baseProps} isReferenceError />);
    expect(screen.getByLabelText('Language')).toBeDisabled();
    expect(screen.getByLabelText('Country')).toBeDisabled();
    expect(screen.getByLabelText('Region')).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load languages and countries right now");
  });

  it('disables only the region select with its own hint when just the regions call failed', () => {
    render(<GeoLocaleFields {...baseProps} countryId={1} isRegionsError />);
    expect(screen.getByLabelText('Language')).toBeEnabled();
    expect(screen.getByLabelText('Country')).toBeEnabled();
    expect(screen.getByLabelText('Region')).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load regions right now");
  });

  it('shows the "Use my current location" button and calls onUseMyLocation on click', async () => {
    const user = userEvent.setup();
    const onUseMyLocation = vi.fn();
    render(<GeoLocaleFields {...baseProps} onUseMyLocation={onUseMyLocation} />);

    const button = screen.getByRole('button', { name: 'Use my current location' });
    await user.click(button);
    expect(onUseMyLocation).toHaveBeenCalled();
  });

  it('shows "Locating…" and disables the button while requesting', () => {
    render(<GeoLocaleFields {...baseProps} isRequestingLocation />);
    expect(screen.getByRole('button', { name: 'Locating…' })).toBeDisabled();
  });

  it('hides the location button entirely when geolocation is not supported', () => {
    render(<GeoLocaleFields {...baseProps} isGeolocationSupported={false} />);
    expect(screen.queryByRole('button', { name: /location/i })).not.toBeInTheDocument();
  });

  it.each([
    ['denied', 'Location access was denied — you can still pick these manually.'],
    ['unavailable', "Location isn't available right now — you can still pick these manually."],
    ['timeout', 'Location took too long to respond — you can still pick these manually.'],
  ] as const)('renders a non-blocking hint for the %s geolocation outcome', (hint, message) => {
    render(<GeoLocaleFields {...baseProps} geoHint={hint} />);
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it('shows no hint when geoHint is null', () => {
    render(<GeoLocaleFields {...baseProps} geoHint={null} />);
    expect(screen.queryByText(/you can still pick these manually/)).not.toBeInTheDocument();
  });
});
