import type { Meta, StoryObj } from '@storybook/react-vite';
import { DeleteGroupConfirmDialog } from './DeleteGroupConfirmDialog';

const meta = {
  title: 'Groups/DeleteGroupConfirmDialog',
  component: DeleteGroupConfirmDialog,
  args: {
    isOpen: true,
    onClose: () => {},
    onConfirm: () => {},
    isSubmitting: false,
    isError: false,
    groupName: 'Riverside Ballers',
  },
} satisfies Meta<typeof DeleteGroupConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Submitting: Story = { args: { isSubmitting: true } };
export const ErrorState: Story = { args: { isError: true } };

/** CLIENT-ERR-5: a coded failure (403 `GROUP_OWNER_REQUIRED`) shows its specific line. */
export const CodedErrorState: Story = {
  args: { isError: true, errorText: 'Only the group owner can do this.' },
};
