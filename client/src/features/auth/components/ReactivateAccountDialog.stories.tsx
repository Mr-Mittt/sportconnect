import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReactivateAccountDialog } from './ReactivateAccountDialog';

const meta = {
  title: 'Auth/ReactivateAccountDialog',
  component: ReactivateAccountDialog,
  args: {
    isOpen: true,
    onClose: () => {},
    onConfirm: () => {},
    isSubmitting: false,
    errorMessage: null,
  },
} satisfies Meta<typeof ReactivateAccountDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Submitting: Story = { args: { isSubmitting: true } };
export const ErrorState: Story = { args: { errorMessage: 'Invalid email or password.' } };
