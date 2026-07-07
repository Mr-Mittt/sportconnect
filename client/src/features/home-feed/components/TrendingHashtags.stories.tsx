import type { Meta, StoryObj } from '@storybook/react-vite';
import type { TrendingHashtag } from '../types';
import { TrendingHashtags } from './TrendingHashtags';

const hashtags: TrendingHashtag[] = [
  { tag: '#fridayrun', postCount: 128 },
  { tag: '#tournament', postCount: 94 },
  { tag: '#pickup', postCount: 61 },
  { tag: '#tennislife', postCount: 47 },
];

const meta = {
  title: 'HomeFeed/TrendingHashtags',
  component: TrendingHashtags,
  args: { onHashtagClick: () => {} },
  // Constrain to the right rail's width so stories match the page context
  decorators: [(Story) => <div style={{ maxWidth: 360 }}>{Story()}</div>],
} satisfies Meta<typeof TrendingHashtags>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Mockup parity: the four trending tags with counts. */
export const Default: Story = {
  args: { hashtags },
};

export const Empty: Story = {
  args: { hashtags: [] },
};

/** A tag longer than the rail truncates instead of pushing the count out. */
export const LongTagTruncates: Story = {
  args: {
    hashtags: [
      { tag: '#absurdlylongweekendtournamenthashtagthatkeepsgoing', postCount: 12 },
      ...hashtags,
    ],
  },
};
