import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { CountryResponse, LanguageResponse, RegionResponse } from '@/shared/types/reference';
import {
  GeoLocaleCountrySelect,
  GeoLocaleLanguageField,
  GeoLocaleLocationButton,
  GeoLocaleLocationHint,
  GeoLocaleReferenceError,
  GeoLocaleRegionField,
} from './GeoLocaleFields';

const languages: LanguageResponse[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
];
const vietnam: CountryResponse = { id: 1, iso2: 'VN', iso3: 'VNM', name: 'Vietnam', defaultLanguageCode: 'vi' };
const singapore: CountryResponse = { id: 2, iso2: 'SG', iso3: 'SGP', name: 'Singapore', defaultLanguageCode: null };
const countries: CountryResponse[] = [vietnam, singapore];
const hcmc: RegionResponse = { id: 101, countryId: 1, isoCode: 'VN-SG', name: 'Ho Chi Minh City', nativeName: 'Hồ Chí Minh' };
const regions: RegionResponse[] = [hcmc];

describe('GeoLocaleLanguageField', () => {
  it('renders the labelled select, empty by default, listing options by nativeName', () => {
    render(
      <GeoLocaleLanguageField languages={languages} isReferenceError={false} languageCode={null} onLanguageChange={() => {}} />,
    );
    expect(screen.getByLabelText('Language')).toHaveValue('');
    expect(screen.getByRole('option', { name: 'English' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Tiếng Việt' })).toBeInTheDocument();
  });

  it('reflects a pre-filled value', () => {
    render(
      <GeoLocaleLanguageField languages={languages} isReferenceError={false} languageCode="vi" onLanguageChange={() => {}} />,
    );
    expect(screen.getByLabelText('Language')).toHaveValue('vi');
  });

  it('calls onLanguageChange on selection', async () => {
    const user = userEvent.setup();
    const onLanguageChange = vi.fn();
    render(
      <GeoLocaleLanguageField languages={languages} isReferenceError={false} languageCode={null} onLanguageChange={onLanguageChange} />,
    );
    await user.selectOptions(screen.getByLabelText('Language'), 'en');
    expect(onLanguageChange).toHaveBeenCalledWith('en');
  });

  it('disables when reference data failed to load', () => {
    render(<GeoLocaleLanguageField languages={languages} isReferenceError languageCode={null} onLanguageChange={() => {}} />);
    expect(screen.getByLabelText('Language')).toBeDisabled();
  });
});

describe('GeoLocaleCountrySelect', () => {
  // No `getByLabelText` here — unlike the other fields, this one renders no `<Label>` of its own
  // (sign-up puts "Country" on its own row above this select and the location button — see
  // RegisterForm.tsx); `getByRole('combobox')` is unambiguous since it's the only select rendered
  // in each of these isolated tests.
  it('renders the select, empty by default, listing countries by their localized display name', () => {
    render(<GeoLocaleCountrySelect countries={countries} isReferenceError={false} countryId={null} onCountryChange={() => {}} />);
    expect(screen.getByRole('combobox')).toHaveValue('');
    expect(screen.getByRole('option', { name: 'Vietnam' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Singapore' })).toBeInTheDocument();
  });

  it('reflects a pre-filled value', () => {
    render(<GeoLocaleCountrySelect countries={countries} isReferenceError={false} countryId={1} onCountryChange={() => {}} />);
    expect(screen.getByRole('combobox')).toHaveValue('1');
  });

  it('calls onCountryChange on selection', async () => {
    const user = userEvent.setup();
    const onCountryChange = vi.fn();
    render(<GeoLocaleCountrySelect countries={countries} isReferenceError={false} countryId={null} onCountryChange={onCountryChange} />);
    await user.selectOptions(screen.getByRole('combobox'), '2');
    expect(onCountryChange).toHaveBeenCalledWith(2);
  });

  it('disables when reference data failed to load', () => {
    render(<GeoLocaleCountrySelect countries={countries} isReferenceError countryId={null} onCountryChange={() => {}} />);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });
});

describe('GeoLocaleRegionField', () => {
  it('reflects a pre-filled value', () => {
    render(
      <GeoLocaleRegionField
        regions={regions}
        countryId={1}
        isReferenceError={false}
        isRegionsError={false}
        regionId={101}
        onRegionChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('Region')).toHaveValue('101');
  });

  it('calls onRegionChange on selection', async () => {
    const user = userEvent.setup();
    const onRegionChange = vi.fn();
    render(
      <GeoLocaleRegionField
        regions={regions}
        countryId={1}
        isReferenceError={false}
        isRegionsError={false}
        regionId={null}
        onRegionChange={onRegionChange}
      />,
    );
    await user.selectOptions(screen.getByLabelText('Region'), '101');
    expect(onRegionChange).toHaveBeenCalledWith(101);
  });

  it('disables the region select when no country is selected yet', () => {
    render(
      <GeoLocaleRegionField
        regions={[]}
        countryId={null}
        isReferenceError={false}
        isRegionsError={false}
        regionId={null}
        onRegionChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('Region')).toBeDisabled();
  });

  it('shows a disabled region select with an explanatory label for a country with no regions', () => {
    render(
      <GeoLocaleRegionField
        regions={[]}
        countryId={2}
        isReferenceError={false}
        isRegionsError={false}
        regionId={null}
        onRegionChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('Region')).toBeDisabled();
    expect(screen.getByText('No regions available for this country')).toBeInTheDocument();
  });

  it('disables with its own hint when just the regions call failed', () => {
    render(
      <GeoLocaleRegionField regions={[]} countryId={1} isReferenceError={false} isRegionsError regionId={null} onRegionChange={() => {}} />,
    );
    expect(screen.getByLabelText('Region')).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load regions right now");
  });
});

describe('GeoLocaleReferenceError', () => {
  it('renders nothing when there is no error', () => {
    const { container } = render(<GeoLocaleReferenceError isReferenceError={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the alert when reference data failed to load', () => {
    render(<GeoLocaleReferenceError isReferenceError />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load languages and countries right now");
  });
});

describe('GeoLocaleLocationButton', () => {
  it('is icon-only with a hover/screen-reader hint, not a visible text label', async () => {
    const user = userEvent.setup();
    const onUseMyLocation = vi.fn();
    render(<GeoLocaleLocationButton isGeolocationSupported isRequestingLocation={false} onUseMyLocation={onUseMyLocation} />);

    // CLIENT-REF-2: icon-only — the button is found by its aria-label/title, not visible text.
    const button = screen.getByRole('button', { name: 'Use my current location' });
    expect(button).toHaveAttribute('title', 'Use my current location');
    await user.click(button);
    expect(onUseMyLocation).toHaveBeenCalled();
  });

  it('shows "Locating…" as the hover/screen-reader hint and disables the button while requesting', () => {
    render(<GeoLocaleLocationButton isGeolocationSupported isRequestingLocation onUseMyLocation={() => {}} />);
    const button = screen.getByRole('button', { name: 'Locating…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Locating…');
  });

  it('renders nothing when geolocation is not supported', () => {
    const { container } = render(
      <GeoLocaleLocationButton isGeolocationSupported={false} isRequestingLocation={false} onUseMyLocation={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('GeoLocaleLocationHint', () => {
  // 2026-09-28 fix: this used to render nested inside GeoLocaleLocationButton's own narrow
  // `shrink-0` flex slot — a full sentence there forced that fixed-width slot wide open and broke
  // the row's layout. It's now its own component, meant to render as a separate, full-width row.
  it.each([
    ['denied', 'Location access was denied — you can still pick these manually.'],
    ['unavailable', "Location isn't available right now — you can still pick these manually."],
    ['timeout', 'Location took too long to respond — you can still pick these manually.'],
  ] as const)('renders a visible, non-blocking hint for the %s geolocation outcome', (hint, message) => {
    render(<GeoLocaleLocationHint geoHint={hint} />);
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it('renders nothing when geoHint is null', () => {
    const { container } = render(<GeoLocaleLocationHint geoHint={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
