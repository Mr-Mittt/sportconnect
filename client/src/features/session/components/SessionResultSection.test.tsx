import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import badminton from '../recordSchema/badminton-record-schema-v1.json';
import { parseRecordSchema, type RecordSchema } from '../recordSchema';
import type { PlayerNames } from '../resultDisplay';
import type { SessionRecord } from '../resultTypes';
import { SessionResultSection } from './SessionResultSection';

const schema = parseRecordSchema(badminton) as RecordSchema;

const names: PlayerNames = new Map([
  ['a', { name: 'Alice Nguyen', avatarUrl: null }],
  ['b', { name: 'Bob Tran', avatarUrl: null }],
  ['c', { name: 'Carolina Fernandez', avatarUrl: null }],
  ['d', { name: 'Dan Pham', avatarUrl: null }],
  ['e', { name: 'Eve Park', avatarUrl: null }],
]);

function record(id: number, data: Record<string, unknown>): SessionRecord {
  return { id, data, createdBy: 'a', createdAt: '', updatedBy: null, updatedAt: '' };
}

function game(
  id: number,
  first: string[],
  second: string[],
  scores: [number | null, number | null] = [21, 18],
) {
  return record(id, {
    teams: [
      { players: first, scores: [scores[0]] },
      { players: second, scores: [scores[1]] },
    ],
  });
}

const good = game(1, ['a'], ['b']);
const broken = record(2, {
  teams: [
    { players: ['a'], scores: [21] },
    { players: [], scores: [null] },
  ],
});

function renderSection(overrides: Partial<React.ComponentProps<typeof SessionResultSection>> = {}) {
  const onUpdate = vi.fn();
  render(
    <SessionResultSection
      schema={schema}
      records={[good]}
      isLoading={false}
      isError={false}
      names={names}
      locale="en"
      canEdit
      windowClosed={false}
      onUpdate={onUpdate}
      {...overrides}
    />,
  );
  return { onUpdate };
}

async function open() {
  await userEvent.setup().click(screen.getByRole('button', { name: /Results/ }));
}

const card = () => screen.getByTestId('record-card');

describe('SessionResultSection', () => {
  it('is collapsed by default, counts the records it can show, and previews them while collapsed', async () => {
    renderSection();
    expect(screen.getByRole('button', { name: /Results \(1\)/ })).toBeInTheDocument();
    expect(screen.getAllByTestId('record-card')).toHaveLength(1);
    await open();
    expect(screen.getAllByTestId('record-card')).toHaveLength(1);
  });

  it('skips a stored record that fails the schema (and does not count it)', async () => {
    renderSection({ records: [good, broken] });
    expect(screen.getByRole('button', { name: /Results \(1\)/ })).toBeInTheDocument();
    await open();
    expect(screen.getAllByTestId('record-card')).toHaveLength(1);
  });

  describe('a record is one line: # | [team 1 score 1] - [score 2 team 2]', () => {
    it('has the number, the left group (team 1, score 1) right-aligned, the dash, and the right group (score 2, team 2) left-aligned', async () => {
      renderSection();
      await open();
      const [number, left, dash, right] = Array.from(card().children) as HTMLElement[];
      expect(number).toHaveTextContent('#1');
      expect(left).toHaveTextContent('Alice Nguyen21');
      expect(left.className).toContain('justify-end');
      expect(dash).toHaveTextContent('–');
      expect(right).toHaveTextContent('18Bob Tran');
      expect(right.className).toContain('justify-start');
      // inside each group: team then score on the left, score then team on the right
      expect(Array.from(left.children).map((c) => c.getAttribute('data-team') ?? 'score')).toEqual([
        'winner',
        'score',
      ]);
      expect(Array.from(right.children).map((c) => c.getAttribute('data-team') ?? 'score')).toEqual(
        ['score', 'loser'],
      );
    });

    it('has no Won / Lost label, and the winner and loser take the schema tones (tokens, never hex)', async () => {
      renderSection();
      await open();
      expect(screen.queryByText('Won')).toBeNull();
      expect(screen.queryByText('Lost')).toBeNull();
      expect(card().querySelector('[data-team="winner"]')?.className).toContain(
        'text-text-success',
      );
      expect(card().querySelector('[data-team="loser"]')?.className).toContain('text-amber-800');
    });

    it('draws the winner last when the schema says winnerAlign RIGHT', async () => {
      renderSection({ schema: { ...schema, ui: { ...schema.ui, winnerAlign: 'RIGHT' } } });
      await open();
      const teams = Array.from(card().querySelectorAll<HTMLElement>('[data-team]'));
      expect(teams.map((team) => team.dataset.team)).toEqual(['loser', 'winner']);
    });

    it('does not shorten names in advance: two players show whole, each cut by the layout only when there is no room', async () => {
      renderSection({ records: [game(1, ['a', 'c'], ['b', 'd'])] });
      await open();
      const left = card().querySelector('[data-team="winner"]') as HTMLElement;
      expect(left).toHaveTextContent('Alice Nguyen/Carolina Fernandez');
      // CSS ellipsis (truncate) on each name, so a narrow view or a long name is cut, a short one is not
      const nameBoxes = Array.from(left.querySelectorAll('.truncate'));
      expect(nameBoxes.map((box) => box.textContent)).toEqual([
        'Alice Nguyen',
        'Carolina Fernandez',
      ]);
      expect(left).toHaveAttribute('title', 'Alice Nguyen\nCarolina Fernandez');
    });

    it('shows the first two players and ...(x) with the team size when there are more', async () => {
      renderSection({
        schema: { ...schema, playersPerSide: { min: 1, max: 4 } },
        records: [game(1, ['a', 'b', 'c', 'e'], ['d'])],
      });
      await open();
      const left = card().querySelector('[data-team="winner"]') as HTMLElement;
      expect(left).toHaveTextContent('Alice Nguyen/Bob Tran/ ...(4)');
      expect(left).toHaveAttribute('title', 'Alice Nguyen\nBob Tran\nCarolina Fernandez\nEve Park');
    });

    it('shows - for a missing score', async () => {
      renderSection({ records: [game(1, ['a'], ['b'], [null, null])] });
      await open();
      const [, left, , right] = Array.from(card().children) as HTMLElement[];
      expect(left).toHaveTextContent('Alice Nguyen-');
      expect(right).toHaveTextContent('-Bob Tran');
    });

    it('with several score slots shows the first score then (...), and every slot as a bullet on hover', async () => {
      const twoSlots: RecordSchema = {
        ...schema,
        slots: [
          { required: true, title: { en: 'Goals', vi: 'Bàn thắng' }, rule: [] },
          { required: false, title: { en: 'Penalties', vi: 'Luân lưu' }, rule: [] },
        ],
      };
      renderSection({
        schema: twoSlots,
        records: [
          record(1, {
            teams: [
              { players: ['a'], scores: [2, 4] },
              { players: ['b'], scores: [2, 3] },
            ],
          }),
        ],
      });
      await open();
      const [, left, , right] = Array.from(card().children) as HTMLElement[];
      expect(left).toHaveTextContent('Alice Nguyen2(...)');
      expect(right).toHaveTextContent('2(...)Bob Tran');
      expect(left.querySelector('[title^="•"]')).toHaveAttribute(
        'title',
        '• Goals: 2\n• Penalties: 4',
      );
      expect(right.querySelector('[title^="•"]')).toHaveAttribute(
        'title',
        '• Goals: 2\n• Penalties: 3',
      );
    });

    it('names a player who is no longer in the session as a former player', async () => {
      renderSection({ names: new Map() });
      await open();
      expect(screen.getAllByText('Former player')).toHaveLength(2);
    });
  });

  it('draws the winner first even when the record was stored with the higher score on the second team', async () => {
    renderSection({ records: [game(1, ['a'], ['b'], [15, 21])] });
    await open();
    const [, left, , right] = Array.from(card().children) as HTMLElement[];
    expect(left).toHaveTextContent('Bob Tran21');
    expect(right).toHaveTextContent('15Alice Nguyen');
  });

  describe('the Winner / Loser labels above the list', () => {
    const labels = () => screen.getByTestId('record-list-header');

    it('shows them in the schema tones, the left one right-aligned over the left team and the right one left-aligned', () => {
      renderSection();
      const [, left, , right] = Array.from(labels().children) as HTMLElement[];
      expect(left).toHaveTextContent('Winner');
      expect(left).toHaveClass('text-right', 'text-text-success', 'underline');
      expect(right).toHaveTextContent('Loser');
      expect(right).toHaveClass('text-left', 'text-amber-800');
    });

    it('uses the same grid as a record line, so they sit over the teams', () => {
      renderSection();
      expect(labels().className).toContain('grid-cols-[1.75rem_minmax(0,1fr)_auto_minmax(0,1fr)]');
      expect(screen.getByTestId('record-card').className).toContain(
        'grid-cols-[1.75rem_minmax(0,1fr)_auto_minmax(0,1fr)]',
      );
    });

    it('swaps with the teams when the schema says winnerAlign RIGHT', () => {
      renderSection({ schema: { ...schema, ui: { ...schema.ui, winnerAlign: 'RIGHT' } } });
      const [, left, , right] = Array.from(labels().children) as HTMLElement[];
      expect(left).toHaveTextContent('Loser');
      expect(right).toHaveTextContent('Winner');
    });

    it('is not shown for an empty section', () => {
      renderSection({ records: [] });
      expect(screen.queryByTestId('record-list-header')).toBeNull();
    });
  });

  describe('collapsed: the 3 latest records; open: all of them', () => {
    const five = [1, 2, 3, 4, 5].map((id) => game(id, ['a'], ['b'], [20 + id, 10]));
    const numbers = () =>
      screen.getAllByTestId('record-card').map((c) => c.children[0].textContent);

    it('collapsed lists only the last 3, keeping their numbers, and says it is a short list', () => {
      renderSection({ records: five });
      expect(screen.getByRole('button', { name: /Results \(5\)/ })).toBeInTheDocument();
      expect(numbers()).toEqual(['#3', '#4', '#5']);
      expect(screen.getByText('Showing the last 3 of 5 results.')).toHaveClass(
        'text-center',
        'italic',
      );
    });

    it('open lists every record, in order, and no short-list line', async () => {
      renderSection({ records: five });
      await open();
      expect(numbers()).toEqual(['#1', '#2', '#3', '#4', '#5']);
      expect(screen.queryByText(/Showing the last/)).toBeNull();
    });

    it('with 3 or fewer records collapsed shows them all and no short-list line', () => {
      renderSection({ records: five.slice(0, 3) });
      expect(numbers()).toEqual(['#1', '#2', '#3']);
      expect(screen.queryByText(/Showing the last/)).toBeNull();
    });
  });

  it('shows the Update button only when the caller can edit, and calls onUpdate', async () => {
    const { onUpdate } = renderSection();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Update' }));
    expect(onUpdate).toHaveBeenCalled();
  });

  it('is read-only (no Update) for a caller who cannot edit', () => {
    renderSection({ canEdit: false });
    expect(screen.queryByRole('button', { name: 'Update' })).toBeNull();
  });

  it('explains the closed 24-hour window', async () => {
    renderSection({ canEdit: false, windowClosed: true });
    await open();
    expect(
      screen.getByText(
        "Results can't be changed any more: 24 hours have passed since the session ended.",
      ),
    ).toBeInTheDocument();
  });

  it('shows the empty hint, centered, while the section is still collapsed, and once when open', async () => {
    renderSection({ records: [] });
    expect(screen.getByText('No results logged yet.')).toHaveClass('text-center');
    await open();
    expect(screen.getAllByText('No results logged yet.')).toHaveLength(1);
  });

  it('shows no empty hint while collapsed when there are records', () => {
    renderSection();
    expect(screen.queryByText('No results logged yet.')).toBeNull();
  });

  it('does not show the empty hint while collapsed when the records failed to load', () => {
    renderSection({ records: undefined, isError: true });
    expect(screen.queryByText('No results logged yet.')).toBeNull();
  });

  it('shows a load error', async () => {
    renderSection({ records: undefined, isError: true });
    await open();
    expect(screen.getByText("Couldn't load the results.")).toBeInTheDocument();
    expect(screen.queryByText('No results logged yet.')).toBeNull();
  });

  it('shows a loading line while the records load', async () => {
    renderSection({ records: undefined, isLoading: true });
    await open();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });
});
