import type { Meta, StoryObj } from '@storybook/react-vite';
import badminton from '../recordSchema/badminton-record-schema-v1.json';
import { parseRecordSchema, type RecordSchema } from '../recordSchema';
import type { PlayerNames } from '../resultDisplay';
import type { SessionRecord } from '../resultTypes';
import { SessionResultSection } from './SessionResultSection';

const schema = parseRecordSchema(badminton) as RecordSchema;

const names: PlayerNames = new Map([
  ['a', { name: 'Alice Nguyen', avatarUrl: null }],
  ['b', { name: 'Bob Tran', avatarUrl: null }],
  ['c', { name: 'Carol Le', avatarUrl: null }],
  ['d', { name: 'Dan Pham', avatarUrl: null }],
]);

function record(id: number, first: string[], second: string[], scores: [number | null, number | null]): SessionRecord {
  return {
    id,
    data: { teams: [{ players: first, scores: [scores[0]] }, { players: second, scores: [scores[1]] }] },
    createdBy: 'a',
    createdAt: '2026-08-01T10:00:00Z',
    updatedBy: null,
    updatedAt: '2026-08-01T10:00:00Z',
  };
}

const records = [record(1, ['a'], ['b'], [21, 18]), record(2, ['a', 'c'], ['b', 'd'], [21, 19]), record(3, ['c'], ['d'], [null, null])];

const meta = {
  title: 'Session/SessionResultSection',
  component: SessionResultSection,
  args: {
    schema,
    records,
    isLoading: false,
    isError: false,
    names,
    locale: 'en',
    canEdit: true,
    windowClosed: false,
    onUpdate: () => {},
  },
  // The section is collapsed by default; the stories that show its body open it with a click in `play`.
  decorators: [(Story) => <div className="max-w-[35rem] p-4"><Story /></div>],
} satisfies Meta<typeof SessionResultSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Collapsed (the default): only the header with the count and the Update button. */
export const Collapsed: Story = {};

/** A joined player, inside the window: the Update button shows. */
export const WithRecords: Story = {
  play: async ({ canvasElement }) => {
    (canvasElement.querySelector('button[aria-expanded]') as HTMLButtonElement | null)?.click();
  },
};

/** Read-only: a group member who has not joined (no Update button). */
export const ReadOnly: Story = {
  args: { canEdit: false },
  play: WithRecords.play,
};

/** 24 hours after the session ended: no Update button and a line saying why. */
export const WindowClosed: Story = {
  args: { canEdit: false, windowClosed: true },
  play: WithRecords.play,
};

export const Empty: Story = {
  args: { records: [] },
  play: WithRecords.play,
};

export const Loading: Story = {
  args: { records: undefined, isLoading: true },
  play: WithRecords.play,
};

export const LoadError: Story = {
  args: { records: undefined, isError: true },
  play: WithRecords.play,
};

/** The schema's `vertical` style with the winner at the bottom, in other tones. */
export const VerticalStyle: Story = {
  args: {
    schema: { ...schema, ui: { id: 'vertical', winnerAlign: 'BOTTOM', winnerTone: 'accent', loserTone: 'danger' } },
  },
  play: WithRecords.play,
};

/** A sport with two score slots (a main score and a penalty score). */
export const TwoScoreSlots: Story = {
  args: {
    schema: {
      ...schema,
      slots: [
        { required: true, title: { en: 'Goals', vi: 'Bàn thắng' }, rule: [] },
        { required: false, title: { en: 'Penalties', vi: 'Luân lưu' }, rule: [] },
      ],
    },
    records: [
      { ...record(1, ['a'], ['b'], [2, 1]), data: { teams: [{ players: ['a'], scores: [2, 4] }, { players: ['b'], scores: [2, 3] }] } },
    ],
  },
  play: WithRecords.play,
};
