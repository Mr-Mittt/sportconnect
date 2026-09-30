import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProfileHeaderPlaceholder } from './ProfileHeaderPlaceholder';

/** PROFILE-12: shown while `/profile`'s profile query is loading or has failed. */
const meta = {
  title: 'Shared/ProfileHeaderPlaceholder',
  component: ProfileHeaderPlaceholder,
  args: { fullName: 'Jordan Lee' },
} satisfies Meta<typeof ProfileHeaderPlaceholder>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A long name truncates instead of overflowing the card. */
export const LongName: Story = {
  args: { fullName: 'Bartholomew Maximilian Featherstonehaugh-Cholmondeley' },
};
