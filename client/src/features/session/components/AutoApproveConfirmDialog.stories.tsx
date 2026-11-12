import type { Meta, StoryObj } from '@storybook/react-vite';
import { AutoApproveConfirmDialog } from './SessionConfirmDialogs';

const meta = {
  title: 'Session/AutoApproveConfirmDialog',
  component: AutoApproveConfirmDialog,
  args: { isOpen: true, onConfirm: () => {}, onCancel: () => {} },
} satisfies Meta<typeof AutoApproveConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Opens instead of checking the "Auto approve join request" box. "Turn on" / "Cancel". */
export const Open: Story = {};
