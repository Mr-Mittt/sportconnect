import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CountryResponse, LanguageResponse, RegionResponse } from '@/shared/types/reference';
import { GeoLocaleFields } from './GeoLocaleFields';

const languages: LanguageResponse[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
];
const vietnam: CountryResponse = { id: 1, iso2: 'VN', iso3: 'VNM', name: 'Vietnam', defaultLanguageCode: 'vi' };
const singapore: CountryResponse = { id: 2, iso2: 'SG', iso3: 'SGP', name: 'Singapore', defaultLanguageCode: null };
const countries: CountryResponse[] = [vietnam, singapore];
const regions: RegionResponse[] = [
  { id: 101, countryId: 1, isoCode: 'VN-HN', name: 'Hanoi', nativeName: 'Hà Nội' },
  { id: 102, countryId: 1, isoCode: 'VN-SG', name: 'Ho Chi Minh City', nativeName: 'Hồ Chí Minh' },
];

const meta = {
  title: 'Shared/GeoLocaleFields',
  component: GeoLocaleFields,
  args: {
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
  },
} satisfies Meta<typeof GeoLocaleFields>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing picked, nothing detected yet. */
export const Default: Story = {};

/** All three fields already resolved/picked, e.g. after a successful silent or coordinate resolve. */
export const PreFilled: Story = {
  args: {
    languageCode: 'vi',
    countryId: 1,
    regionId: 102,
    regions,
  },
};

/** "Use my current location" clicked — button reads "Locating…" and is disabled until it settles. */
export const Resolving: Story = {
  args: {
    isRequestingLocation: true,
  },
};

/** Geolocation permission was denied — a non-blocking hint, fields stay usable manually. */
export const GeolocationDenied: Story = {
  args: {
    geoHint: 'denied',
  },
};

/** A country with no seeded regions (e.g. Singapore, until REF-4 seeds its regions) — the region
 * select renders disabled with an explanatory label instead of an empty, seemingly-broken list. */
export const NoRegionsCountry: Story = {
  args: {
    countryId: 2,
    regions: [],
  },
};

/** `GET /reference/languages`/`countries` failed — all three selects render disabled with an
 * error hint; sign-up/profile must stay usable regardless (the fields are optional). */
export const ReferenceLoadError: Story = {
  args: {
    isReferenceError: true,
  },
};
