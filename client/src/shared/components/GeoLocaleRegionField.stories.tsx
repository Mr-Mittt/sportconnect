import type { Meta, StoryObj } from '@storybook/react-vite';
import type { RegionResponse } from '@/shared/types/reference';
import { GeoLocaleRegionField } from './GeoLocaleFields';

const regions: RegionResponse[] = [
  { id: 101, countryId: 1, isoCode: 'VN-HN', name: 'Hanoi', nativeName: 'Hà Nội' },
  { id: 102, countryId: 1, isoCode: 'VN-SG', name: 'Ho Chi Minh City', nativeName: 'Hồ Chí Minh' },
];

/** CLIENT-REF-1/CLIENT-REF-2: one of `GeoLocaleFields.tsx`'s split field components — see that
 * file's module doc for why it's no longer one fixed-layout component. */
const meta = {
  title: 'Shared/GeoLocaleFields/Region',
  component: GeoLocaleRegionField,
  args: {
    regions: [],
    countryId: null,
    isReferenceError: false,
    isRegionsError: false,
    regionId: null,
    onRegionChange: () => {},
  },
} satisfies Meta<typeof GeoLocaleRegionField>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No country picked yet — disabled, no explanatory hint (the normal starting state). */
export const Default: Story = {};

export const PreFilled: Story = {
  args: { countryId: 1, regions, regionId: 102 },
};

/** A country with no seeded regions (e.g. Singapore, until REF-4 seeds its regions) — disabled
 * with an explanatory label instead of an empty, seemingly-broken list. */
export const NoRegionsCountry: Story = {
  args: { countryId: 2, regions: [] },
};

export const RegionsLoadError: Story = {
  args: { countryId: 1, isRegionsError: true },
};
