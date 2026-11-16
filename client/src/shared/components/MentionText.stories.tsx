import type { Meta, StoryObj } from '@storybook/react-vite';
import { MentionText } from './MentionText';

const meta = {
  title: 'Shared/MentionText',
  component: MentionText,
  args: { className: 'text-2sm text-text-primary' },
} satisfies Meta<typeof MentionText>;

export default meta;
type Story = StoryObj<typeof meta>;

const ID = '123e4567-e89b-12d3-a456-426614174000';

/** A stored comment: the tags are chips with the stored name, the ids are never shown. */
export const WithTags: Story = {
  args: { text: `Nice game @[Alice Nguyen](${ID}) and @[Đặng Tuấn Anh](${ID})!` },
};

export const PlainComment: Story = { args: { text: 'See you all there.' } };

/** Markup that cannot be read stays as the plain text it is. */
export const UnreadableMarkup: Story = { args: { text: 'broken @[Bao](tag' } };
