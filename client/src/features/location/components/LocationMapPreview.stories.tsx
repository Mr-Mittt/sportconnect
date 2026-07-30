import type { Meta, StoryObj } from '@storybook/react-vite';
import { LocationMapPreview } from './LocationMapPreview';

const meta = {
  title: 'Location/LocationMapPreview',
  component: LocationMapPreview,
  args: {
    latitude: 21.0285,
    longitude: 105.8542,
    onMove: () => {},
    mapSeed: 0,
  },
} satisfies Meta<typeof LocationMapPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
