import type { Meta, StoryObj } from '@storybook/react-vite';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { CreatePostForm } from './CreatePostForm';

const currentUser = { firstName: 'Jordan', fullName: 'Jordan Lee', avatarUrl: null };

/**
 * PROFILE-10: `useUnsavedChangesGuard`'s `useBlocker` requires a data router — this decorator
 * gives every story one, same reasoning `AdminLayout.stories.tsx`'s shared wrapper already uses.
 */
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
  decorators: [
    (Story) => {
      const router = createMemoryRouter([{ path: '/', element: <Story /> }]);
      return <RouterProvider router={router} />;
    },
  ],
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

/** CLIENT-GL-50 part 2: `@` offers the people of the source (friends for a user post, group members for a group post); Enter adds a line. */
export const WithTagging: Story = {
  args: {
    mentionSource: {
      options: [
        { id: 'u-priya', name: 'Priya Shah', label: 'Priya Shah', avatarUrl: null },
        { id: 'u-sam', name: 'Sam Ito', label: 'Sam Ito', avatarUrl: null },
      ],
      onQueryChange: () => {},
    },
  },
};
