import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import { expect, userEvent, within } from 'storybook/test';
import { LoginForm } from './LoginForm';

const meta = {
  title: 'Auth/LoginForm',
  component: LoginForm,
  // First component using <Link> — wraps every story in a router so the
  // "Create an account" link renders without needing a real app shell.
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
    errorMessage: null,
  },
} satisfies Meta<typeof LoginForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Submitting: Story = {
  args: { isPending: true },
};

export const Error: Story = {
  args: { errorMessage: 'Invalid email or password' },
};

/**
 * I18N-10 fix (2026-09-29): custom `noValidate` validation, not native HTML popups — clicking
 * "Log in" with both fields empty reveals translated inline messages beside each label instead of
 * the browser's own untranslatable ones.
 */
export const InvalidSubmit: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Log in' }));
    await expect(canvas.getByText('Email is required.')).toBeInTheDocument();
    await expect(canvas.getByText('Password is required.')).toBeInTheDocument();
  },
};
