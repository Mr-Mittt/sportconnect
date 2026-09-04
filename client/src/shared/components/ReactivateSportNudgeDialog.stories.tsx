import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReactivateSportNudgeDialog } from './ReactivateSportNudgeDialog';

const meta = {
  title: 'Shared/ReactivateSportNudgeDialog',
  component: ReactivateSportNudgeDialog,
  args: {
    isOpen: true,
    mode: 'sport-pill',
    sportName: 'Badminton',
    onLater: () => {},
    onReactivate: () => {},
    isReactivating: false,
    isError: false,
  },
} satisfies Meta<typeof ReactivateSportNudgeDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Shown when a deactivated sport pill is picked in the switcher (Home Feed / Groups / Matches). */
export const SportPill: Story = {};

/** Shown when a group linked to a deactivated sport is opened on the Groups page. */
export const Group: Story = { args: { mode: 'group' } };

export const Reactivating: Story = { args: { isReactivating: true } };
export const ErrorState: Story = { args: { isError: true } };
