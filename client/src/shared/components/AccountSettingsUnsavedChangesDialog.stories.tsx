import type { Meta, StoryObj } from '@storybook/react-vite';
import { AccountSettingsUnsavedChangesDialog } from './AccountSettingsUnsavedChangesDialog';

const meta = {
  title: 'Shared/AccountSettingsUnsavedChangesDialog',
  component: AccountSettingsUnsavedChangesDialog,
  args: {
    isOpen: true,
    onCancel: () => {},
    onDiscard: () => {},
    onSave: () => {},
    isSaving: false,
    saveErrorMessage: null,
  },
} satisfies Meta<typeof AccountSettingsUnsavedChangesDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Saving: Story = { args: { isSaving: true } };
export const SaveFailed: Story = { args: { saveErrorMessage: 'Something went wrong on our side. Try again.' } };
