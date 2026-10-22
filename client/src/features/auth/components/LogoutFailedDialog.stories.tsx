import type { Meta, StoryObj } from '@storybook/react-vite';
import { LogoutFailedDialog } from './LogoutFailedDialog';

const meta = {
  title: 'Auth/LogoutFailedDialog',
  component: LogoutFailedDialog,
  args: { isOpen: true, onRetry: () => {}, onStay: () => {}, isRetrying: false },
} satisfies Meta<typeof LogoutFailedDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Retrying: Story = { args: { isRetrying: true } };
