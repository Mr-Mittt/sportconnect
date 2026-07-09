import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import { RegisterForm } from './RegisterForm';

const meta = {
  title: 'Auth/RegisterForm',
  component: RegisterForm,
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
} satisfies Meta<typeof RegisterForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Submitting: Story = {
  args: { isPending: true },
};

export const Error: Story = {
  args: { errorMessage: 'Email already registered' },
};
