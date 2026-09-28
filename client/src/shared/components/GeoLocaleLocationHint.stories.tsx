import type { Meta, StoryObj } from '@storybook/react-vite';
import { GeoLocaleLocationHint } from './GeoLocaleFields';

/** CLIENT-REF-1/CLIENT-REF-2: the *result* of a "Use my current location" click
 * (denied/unavailable/timeout) — split out of `GeoLocaleLocationButton` (2026-09-28 fix) so a
 * parent can render it as its own full-width row instead of nested inside that button's narrow
 * flex slot, where the full sentence used to force the slot wide open. */
const meta = {
  title: 'Shared/GeoLocaleFields/LocationHint',
  component: GeoLocaleLocationHint,
  args: {
    geoHint: null,
  },
} satisfies Meta<typeof GeoLocaleLocationHint>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing to show — renders `null`. */
export const NoHint: Story = {};

export const Denied: Story = {
  args: { geoHint: 'denied' },
};

export const Unavailable: Story = {
  args: { geoHint: 'unavailable' },
};

export const Timeout: Story = {
  args: { geoHint: 'timeout' },
};
