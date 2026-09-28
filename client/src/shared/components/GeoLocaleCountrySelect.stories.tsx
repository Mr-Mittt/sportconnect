import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CountryResponse } from '@/shared/types/reference';
import { GeoLocaleCountrySelect } from './GeoLocaleFields';

const vietnam: CountryResponse = { id: 1, iso2: 'VN', iso3: 'VNM', name: 'Vietnam', defaultLanguageCode: 'vi' };
const singapore: CountryResponse = { id: 2, iso2: 'SG', iso3: 'SGP', name: 'Singapore', defaultLanguageCode: null };
const countries: CountryResponse[] = [vietnam, singapore];

/** CLIENT-REF-1/CLIENT-REF-2: one of `GeoLocaleFields.tsx`'s split field components — see that
 * file's module doc for why it's no longer one fixed-layout component. Bare select, no `Label`
 * (unlike the other fields) — sign-up renders the "Country" label separately above a row holding
 * this select and the location button side by side, so this story has no visible label either. */
const meta = {
  title: 'Shared/GeoLocaleFields/Country',
  component: GeoLocaleCountrySelect,
  args: {
    countries,
    isReferenceError: false,
    countryId: null,
    onCountryChange: () => {},
  },
} satisfies Meta<typeof GeoLocaleCountrySelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const PreFilled: Story = {
  args: { countryId: 1 },
};

export const ReferenceLoadError: Story = {
  args: { isReferenceError: true },
};
