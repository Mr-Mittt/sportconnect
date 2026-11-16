import type { Meta, StoryObj } from '@storybook/react-vite';
import { PostText } from './PostText';

const meta = {
  title: 'Shared/PostText',
  component: PostText,
  args: { onHashtagClick: () => {}, className: 'text-sm text-text-primary' },
} satisfies Meta<typeof PostText>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A tagged person is a chip with the stored name; the id never shows. The hashtag stays clickable. */
export const WithTagAndHashtag: Story = {
  args: { text: 'Game tonight with @[Priya Shah](123e4567-e89b-12d3-a456-426614174000) #derby' },
};

/** The line breaks of a multi-line post show. */
export const MultiLine: Story = {
  args: { text: 'Game tonight with @[Priya Shah](123e4567-e89b-12d3-a456-426614174000)\nCourt 3 at 7pm\nBring water' },
};

/** Text with no tag renders as before. */
export const Plain: Story = { args: { text: 'Great 5-a-side session tonight! #5aside' } };
