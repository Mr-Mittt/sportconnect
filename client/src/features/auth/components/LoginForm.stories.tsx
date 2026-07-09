import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
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
