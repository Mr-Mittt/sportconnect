import type { Meta, StoryObj } from '@storybook/react-vite';
import { GeoLocaleLocationButton } from './GeoLocaleFields';

/** CLIENT-REF-1/CLIENT-REF-2: icon-only (user decision 2026-09-28) — the instructional copy is a
 * hover `title`/screen-reader `aria-label` now, not visible text; see the component's own doc
 * comment. The `geoHint` result renders as a separate `GeoLocaleLocationHint` component (its own
 * story file) — it used to render nested inside this button's own narrow flex slot, where a full
 * sentence forced that fixed-width slot wide open and broke sign-up's row layout. */
const meta = {
  title: 'Shared/GeoLocaleFields/LocationButton',
  component: GeoLocaleLocationButton,
  args: {
    isGeolocationSupported: true,
    isRequestingLocation: false,
    onUseMyLocation: () => {},
  },
} satisfies Meta<typeof GeoLocaleLocationButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Clicked — the icon button disables and its hover/screen-reader hint changes to "Locating…". */
export const Resolving: Story = {
  args: { isRequestingLocation: true },
};

export const NotSupported: Story = {
  args: { isGeolocationSupported: false },
};
