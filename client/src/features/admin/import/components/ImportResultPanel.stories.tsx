import type { Meta, StoryObj } from '@storybook/react-vite';
import { ImportResultPanel } from './ImportResultPanel';

const meta = {
  title: 'Admin/Import/ImportResultPanel',
  component: ImportResultPanel,
  decorators: [
    (Story) => (
      <div className="max-w-[640px] p-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ImportResultPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every session was imported. */
export const AllImported: Story = {
  args: {
    result: {
      created: 2, skipped: 0, failed: 0,
      results: [
        { title: "BkBg's session on 29th, Oct 2026", localDate: '2026-10-29', status: 'CREATED', sessionId: 1 },
        { title: "BkBg's session on 27th, Oct 2026", localDate: '2026-10-27', status: 'CREATED', sessionId: 2 },
      ],
    },
  },
};

/** A repeat: every session was already there. */
export const AllSkipped: Story = {
  args: {
    result: {
      created: 0, skipped: 2, failed: 0,
      results: [
        { title: "BkBg's session on 29th, Oct 2026", localDate: '2026-10-29', status: 'SKIPPED' },
        { title: "BkBg's session on 27th, Oct 2026", localDate: '2026-10-27', status: 'SKIPPED' },
      ],
    },
  },
};

/** One session failed: the rest were imported, and the hint says how to retry. */
export const WithFailure: Story = {
  args: {
    result: {
      created: 1, skipped: 1, failed: 1,
      results: [
        { title: "BkBg's session on 29th, Oct 2026", localDate: '2026-10-29', status: 'CREATED', sessionId: 1 },
        { title: "BkBg's session on 27th, Oct 2026", localDate: '2026-10-27', status: 'SKIPPED' },
        { title: "BkBg's session on 24th, Oct 2026", localDate: '2026-10-24', status: 'FAILED' },
      ],
    },
  },
};
