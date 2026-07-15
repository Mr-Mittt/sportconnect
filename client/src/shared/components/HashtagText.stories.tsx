import type { Meta, StoryObj } from '@storybook/react-vite';
import { HashtagText } from './HashtagText';

const meta = {
  title: 'Shared/HashtagText',
  component: HashtagText,
  args: {
    onHashtagClick: () => {},
    className: 'text-sm text-text-primary',
  },
} satisfies Meta<typeof HashtagText>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PlainText: Story = {
  args: { text: 'Great match today, see you all next week!' },
};

export const SingleHashtag: Story = {
  args: { text: 'Great match today! #fridayrun' },
};

export const MultipleHashtags: Story = {
  args: {
    text: 'Post-season wrap-up: what a season. #wrapup #season2026 #squadgoals',
  },
};
