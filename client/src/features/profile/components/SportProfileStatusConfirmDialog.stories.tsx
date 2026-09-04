import type { Meta, StoryObj } from '@storybook/react-vite';
import { SportProfileStatusConfirmDialog } from './SportProfileStatusConfirmDialog';

const meta = {
  title: 'Profile/SportProfileStatusConfirmDialog',
  component: SportProfileStatusConfirmDialog,
  args: {
    isOpen: true,
    mode: 'deactivate',
    sportName: 'Badminton',
    onClose: () => {},
    onConfirm: () => {},
    isSubmitting: false,
    isError: false,
  },
} satisfies Meta<typeof SportProfileStatusConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Turning an active profile off — "Stop playing {Sport} for a while?" + the keep-your-data note. */
export const Deactivate: Story = {};

/** Turning a deactivated profile back on — "Welcome back to {Sport}!" */
export const Reactivate: Story = { args: { mode: 'reactivate' } };

export const Submitting: Story = { args: { isSubmitting: true } };
export const ErrorState: Story = { args: { isError: true } };
