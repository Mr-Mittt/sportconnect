import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import { expect, userEvent, within } from 'storybook/test';
import { ForgotPasswordForm } from './ForgotPasswordForm';

const meta = {
  title: 'Auth/ForgotPasswordForm',
  component: ForgotPasswordForm,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
  args: {
    onSubmit: () => {},
    isPending: false,
    isSent: false,
    errorMessage: null,
  },
} satisfies Meta<typeof ForgotPasswordForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Prefilled: Story = {
  args: { initialEmail: 'jordan@example.com' },
};

export const Sending: Story = {
  args: { isPending: true },
};

export const Sent: Story = {
  args: { isSent: true },
};

export const Error: Story = {
  args: { errorMessage: 'Something went wrong. Try again in a moment.' },
};

export const InvalidSubmit: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Send reset link' }));
    await expect(canvas.getByText('Email is required.')).toBeInTheDocument();
  },
};
