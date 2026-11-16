import type { Meta, StoryObj } from '@storybook/react-vite';
import { MentionInput } from './MentionInput';

const options = [
  { id: '1', name: 'Alice Nguyen', label: 'Alice Nguyen', avatarUrl: null },
  { id: '2', name: 'Đặng Tuấn Anh', label: 'Đặng Tuấn Anh', avatarUrl: null },
  { id: '3', name: 'Carol Le', label: 'Carol Le', avatarUrl: null },
];

const meta = {
  title: 'Shared/MentionInput',
  component: MentionInput,
  args: {
    ariaLabel: 'Add a comment',
    placeholder: 'Add a comment…',
    maxLength: 1000,
    options,
    pickerLabel: 'People you can tag',
    onChange: () => {},
    onSubmit: () => {},
  },
} satisfies Meta<typeof MentionInput>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the placeholder. Type `@` to open the list; Enter or Tab picks, Esc closes; the pick is a chip. */
export const Default: Story = {};

/** A short limit shows the counter (it appears from 80% of the limit and counts the stored text). */
export const ShortLimit: Story = { args: { maxLength: 20 } };

/** No people to offer (none loaded, or the request failed): the box keeps working without a list. */
export const NoPeople: Story = { args: { options: [] } };
