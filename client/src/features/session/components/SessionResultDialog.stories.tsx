import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import badminton from '../recordSchema/badminton-record-schema-v1.json';
import { parseRecordSchema, type RecordSchema } from '../recordSchema';
import type { PlayerNames } from '../resultDisplay';
import type { SessionRecord } from '../resultTypes';
import { SessionResultDialog } from './SessionResultDialog';

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

const saved = [record(1, ['a'], ['b'], [21, 18]), record(2, ['a', 'c'], ['b', 'd'], [21, 19])];

const meta = {
  title: 'Session/SessionResultDialog',
  component: SessionResultDialog,
  args: {
    isOpen: true,
    onClose: () => {},
    sessionId: 1,
    schema,
    records: saved,
    playerIds: ['a', 'b', 'c', 'd'],
    names,
    locale: 'en',
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={new QueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof SessionResultDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Opens on the saved records (#1, #2) and one empty placeholder (#3); nothing to save yet. */
export const WithRecords: Story = {};

/** A session with no records yet: only the placeholder. */
export const Empty: Story = { args: { records: [] } };

/** The session is at `maxRecords`: no placeholder, and a hint says why. */
export const AtLimit: Story = { args: { schema: { ...schema, maxRecords: 2 } } };

/** Up to four players a side: the slots stack vertically. */
export const FourPlayersASide: Story = {
  args: { schema: { ...schema, playersPerSide: { min: 2, max: 4 } }, records: [] },
};

/** Two score slots a side (main and penalty), always stacked. */
export const TwoScoreSlots: Story = {
  args: {
    schema: {
      ...schema,
      slots: [
        { required: true, title: { en: 'Goals', vi: 'Bàn thắng' }, rule: [] },
        { required: false, title: { en: 'Penalties', vi: 'Luân lưu' }, rule: [] },
      ],
    },
    records: [],
  },
};

/** The vertical style, winner at the bottom, other tones. */
export const VerticalStyle: Story = {
  args: {
    schema: { ...schema, ui: { id: 'vertical', winnerAlign: 'BOTTOM', winnerTone: 'accent', loserTone: 'danger' } },
  },
};
