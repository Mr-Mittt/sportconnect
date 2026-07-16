import type { Meta, StoryObj } from '@storybook/react-vite';
import type { TrendingHashtag } from '@/shared/types/rail';
import { TrendingHashtags } from './TrendingHashtags';

const hashtags: TrendingHashtag[] = [
  { tag: '#fridayrun', postCount: 128 },
  { tag: '#tournament', postCount: 94 },
  { tag: '#pickup', postCount: 61 },
  { tag: '#tennislife', postCount: 47 },
];

const meta = {
  title: 'Shared/TrendingHashtags',
  component: TrendingHashtags,
  args: { onHashtagClick: () => {}, isLoading: false, isError: false, onRetry: () => {} },
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

export const Loading: Story = {
  args: { hashtags: [], isLoading: true },
};

export const ErrorState: Story = {
  args: { hashtags: [], isError: true },
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
