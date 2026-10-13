import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { ResetPasswordForm } from './ResetPasswordForm';

const meta = {
  title: 'Auth/ResetPasswordForm',
  component: ResetPasswordForm,
  args: {
    onSubmit: () => {},
    isPending: false,
    errorMessage: null,
  },
} satisfies Meta<typeof ResetPasswordForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Updating: Story = {
  args: { isPending: true },
};

export const Error: Story = {
  args: { errorMessage: 'Some of the information you entered isn’t valid. Check the form and try again.' },
};

export const MismatchSubmit: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText('New password'), 'newpassword1');
    await userEvent.type(canvas.getByLabelText('Confirm new password'), 'newpassword2');
    await userEvent.click(canvas.getByRole('button', { name: 'Update password' }));
    await expect(canvas.getByText('The passwords don’t match.')).toBeInTheDocument();
  },
};
