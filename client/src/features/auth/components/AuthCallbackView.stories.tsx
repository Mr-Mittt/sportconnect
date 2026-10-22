import type { Meta, StoryObj } from '@storybook/react-vite';
import { AuthCallbackView } from './AuthCallbackView';

const meta = {
  title: 'Auth/AuthCallbackView',
  component: AuthCallbackView,
  parameters: { layout: 'fullscreen' },
  args: { errorMessage: null, onRetry: () => {} },
} satisfies Meta<typeof AuthCallbackView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SigningIn: Story = {};
export const ErrorState: Story = {
  args: { errorMessage: 'Your sign-in link expired or was already used. Try signing in again.' },
};
