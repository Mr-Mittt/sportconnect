import type { Meta, StoryObj } from '@storybook/react-vite';
import { CreatePostForm } from './CreatePostForm';

const currentUser = { firstName: 'Jordan', fullName: 'Jordan Lee', avatarUrl: null };

const meta = {
  title: 'Shared/CreatePostForm',
  component: CreatePostForm,
  args: {
    currentUser,
    onSubmit: () => {},
    isSubmitting: false,
    onPhotoClick: () => {},
    onLocationClick: () => {},
    onTagSportClick: () => {},
  },
} satisfies Meta<typeof CreatePostForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const Submitting: Story = {
  args: { isSubmitting: true },
};

export const NoCurrentUser: Story = {
  args: { currentUser: undefined },
};

export const CanBroadcast: Story = {
  args: { canBroadcast: true },
};

export const ErrorState: Story = {
  args: { isError: true },
};
