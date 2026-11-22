import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import type { ImportCandidate, ImportPreviewPlayer, ImportPreviewSession } from '../types';
import { ImportPreviewTable } from './ImportPreviewTable';

const members: ImportCandidate[] = [
  { userId: 'u-anh-a', fullName: 'Ánh Nguyễn' },
  { userId: 'u-anh-b', fullName: 'Ánh Vãng Lai' },
  { userId: 'u-bao', fullName: 'Bảo Nguyễn' },
  { userId: 'u-hieu', fullName: 'Hiếu Nguyễn' },
];

const matched = (name: string, userId: string, fullName: string): ImportPreviewPlayer => ({ name, userId, fullName });
const unmatched = (name: string): ImportPreviewPlayer => ({ name, userId: null, fullName: null });

const sessions: ImportPreviewSession[] = [
  {
    title: "BkBg's session on 29th, Oct 2026", localDate: '2026-10-29', scheduledStart: '2026-10-29T00:00:00Z', scheduledEndAt: '2026-10-29T02:00:00Z',
    exists: false,
    games: [
      { winners: [matched('Hiếu', 'u-hieu', 'Hiếu Nguyễn'), unmatched('Anh_VL')], losers: [matched('Bảo', 'u-bao', 'Bảo Nguyễn'), unmatched('Ánh')] },
      { winners: [matched('Bảo', 'u-bao', 'Bảo Nguyễn')], losers: [matched('Hiếu', 'u-hieu', 'Hiếu Nguyễn')] },
    ],
  },
  {
    title: "BkBg's session on 27th, Oct 2026", localDate: '2026-10-27', scheduledStart: '2026-10-27T00:00:00Z', scheduledEndAt: '2026-10-27T02:00:00Z',
    exists: true,
    games: [{ winners: [matched('Hiếu', 'u-hieu', 'Hiếu Nguyễn')], losers: [matched('Bảo', 'u-bao', 'Bảo Nguyễn')] }],
  },
];

const meta = {
  title: 'Admin/Import/ImportPreviewTable',
  component: ImportPreviewTable,
  args: { sessions, aliases: {}, members },
  decorators: [
    (Story) => (
      <div className="max-w-[640px] p-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ImportPreviewTable>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Two sessions collapsed: the second is already in the group ("Already imported"), the first has names nobody matched yet. */
export const Collapsed: Story = {};

/** The first session opened: winners first, an unmatched name reads "(not matched)". */
export const GamesOpen: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getAllByRole('button')[0]);
  },
};

/** The same session once the admin has chosen a member for each unmatched name. */
export const NamesChosen: Story = {
  args: { aliases: { Anh_VL: 'u-anh-b', Ánh: 'u-anh-a' } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getAllByRole('button')[0]);
  },
};
