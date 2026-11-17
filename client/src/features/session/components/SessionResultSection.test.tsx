import { cleanup, render, screen, within } from '@testing-library/react';
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
      playerIds={['a', 'b', 'c', 'd', 'e']}
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

  describe('a record is one line: [team 1 score 1] - [score 2 team 2]', () => {
    it('has no record number, the left group (team 1, score 1) right-aligned, the dash, and the right group (score 2, team 2) left-aligned', async () => {
      renderSection();
      await open();
      const [left, dash, right, action] = Array.from(card().children) as HTMLElement[];
      expect(card()).not.toHaveTextContent('#');
      expect(action).toContainElement(screen.getByRole('button', { name: 'Copy result id' }));
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
      expect(within(card()).queryByText('Won')).toBeNull();
      expect(within(card()).queryByText('Lost')).toBeNull();
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
      const [left, , right] = Array.from(card().children) as HTMLElement[];
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
      const [left, , right] = Array.from(card().children) as HTMLElement[];
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
      expect(within(card()).getAllByText('Former player')).toHaveLength(2);
    });
  });

  it('draws the winner first even when the record was stored with the higher score on the second team', async () => {
    renderSection({ records: [game(1, ['a'], ['b'], [15, 21])] });
    await open();
    const [left, , right] = Array.from(card().children) as HTMLElement[];
    expect(left).toHaveTextContent('Bob Tran21');
    expect(right).toHaveTextContent('15Alice Nguyen');
  });

  describe('the Winner / Loser labels above the list', () => {
    const labels = () => screen.getByTestId('record-list-header');

    it('shows them in the schema tones, the left one right-aligned over the left team and the right one left-aligned', () => {
      renderSection();
      const [left, , right] = Array.from(labels().children) as HTMLElement[];
      expect(left).toHaveTextContent('Winner');
      expect(left).toHaveClass('text-right', 'text-text-success', 'underline');
      expect(right).toHaveTextContent('Loser');
      expect(right).toHaveClass('text-left', 'text-amber-800');
    });

    it('uses the same grid as a record line, so they sit over the teams', () => {
      renderSection();
      expect(labels().className).toContain('grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_1.5rem]');
      expect(screen.getByTestId('record-card').className).toContain(
        'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_1.5rem]',
      );
    });

    it('swaps with the teams when the schema says winnerAlign RIGHT', () => {
      renderSection({ schema: { ...schema, ui: { ...schema.ui, winnerAlign: 'RIGHT' } } });
      const [left, , right] = Array.from(labels().children) as HTMLElement[];
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
    const shownScores = () =>
      screen.getAllByTestId('record-card').map((c) => c.children[0].textContent);

    it('collapsed lists only the last 3 and says it is a short list', () => {
      renderSection({ records: five });
      expect(screen.getByRole('button', { name: /Results \(5\)/ })).toBeInTheDocument();
      expect(shownScores()).toEqual(['Alice Nguyen23', 'Alice Nguyen24', 'Alice Nguyen25']);
      expect(screen.getByText('Showing the last 3 of 5 results.')).toHaveClass(
        'text-center',
        'italic',
      );
    });

    it('open lists every record, in order, and no short-list line', async () => {
      renderSection({ records: five });
      await open();
      expect(shownScores()).toEqual([
        'Alice Nguyen21',
        'Alice Nguyen22',
        'Alice Nguyen23',
        'Alice Nguyen24',
        'Alice Nguyen25',
      ]);
      expect(screen.queryByText(/Showing the last/)).toBeNull();
    });

    it('with 3 or fewer records collapsed shows them all and no short-list line', () => {
      renderSection({ records: five.slice(0, 3) });
      expect(shownScores()).toEqual(['Alice Nguyen21', 'Alice Nguyen22', 'Alice Nguyen23']);
      expect(screen.queryByText(/Showing the last/)).toBeNull();
    });
  });

  describe('CLIENT-GL-39: copy the record id', () => {
    it('copies the real record id (not the position) when the caller can edit', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      // userEvent.setup() installs its own clipboard stub: replace it after setup
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      renderSection({ records: [game(41, ['a'], ['b']), game(57, ['c'], ['d'])] });
      await user.click(screen.getByRole('button', { name: /Results/ }));
      const buttons = screen.getAllByRole('button', { name: 'Copy result id' });
      expect(buttons).toHaveLength(2);
      await user.click(buttons[1]);
      expect(writeText).toHaveBeenCalledWith('57');
    });

    it('shows no copy button to a caller who cannot edit', async () => {
      renderSection({ canEdit: false });
      await open();
      expect(screen.queryByRole('button', { name: 'Copy result id' })).toBeNull();
    });
  });

  describe('CLIENT-GL-39: the "my results" switch', () => {
    const mine = game(1, ['a'], ['b']);
    const others = game(2, ['c'], ['d']);

    it('is off by default, has no visible label, and shows every game', async () => {
      renderSection({ records: [mine, others], currentUserId: 'a' });
      await open();
      const toggle = screen.getByRole('switch', { name: 'My results' });
      expect(toggle).toHaveAttribute('aria-checked', 'false');
      expect(toggle).toHaveTextContent('');
      expect(screen.getAllByTestId('record-card')).toHaveLength(2);
    });

    it('narrows the list to the games the caller plays in, and the title reads Results (mine/all)', async () => {
      renderSection({ records: [mine, others], currentUserId: 'b' });
      await open();
      const user = userEvent.setup();
      expect(screen.getByRole('button', { name: /Results \(2\)/ })).toBeInTheDocument();
      await user.click(screen.getByRole('switch', { name: 'My results' }));
      expect(screen.getAllByTestId('record-card')).toHaveLength(1);
      expect(screen.getByTestId('record-card')).toHaveTextContent('Alice Nguyen21');
      expect(screen.getByRole('button', { name: /Results \(1\/2\)/ })).toBeInTheDocument();
      // off again: the number of all games, as before
      await user.click(screen.getByRole('switch', { name: 'My results' }));
      expect(screen.getByRole('button', { name: /Results \(2\)/ })).toBeInTheDocument();
    });

    it('reads Results (0/1) when none of the games include the caller', async () => {
      renderSection({ records: [others], currentUserId: 'a' });
      await open();
      await userEvent.setup().click(screen.getByRole('switch', { name: 'My results' }));
      expect(screen.getByRole('button', { name: /Results \(0\/1\)/ })).toBeInTheDocument();
    });

    it('says so when none of the games include the caller', async () => {
      renderSection({ records: [others], currentUserId: 'a' });
      await open();
      await userEvent.setup().click(screen.getByRole('switch', { name: 'My results' }));
      expect(screen.queryByTestId('record-card')).toBeNull();
      expect(screen.getAllByText('None of the results include you.').length).toBeGreaterThan(0);
    });

    it('shows to a caller who cannot edit too', () => {
      renderSection({ canEdit: false, currentUserId: 'a' });
      expect(screen.getByRole('switch', { name: 'My results' })).toBeInTheDocument();
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

describe('SessionResultSection scoreboard (CLIENT-GL-49)', () => {
  // A sport that chose its own columns, order and a title (the badminton example uses the catalog default).
  const custom: RecordSchema = {
    ...schema,
    scoreboard: {
      ...schema.scoreboard,
      columns: ['games', 'wins', 'losses', 'winDiff', 'scoreDiff'],
      titles: { scoreDiff: { en: 'Points +/-', vi: 'Hiệu số điểm' } },
      sort: [
        { by: 'wins', dir: 'DESC' },
        { by: 'scoreDiff', dir: 'DESC' },
        { by: 'name', dir: 'ASC' },
      ],
    },
  };
  const rows = () => screen.getAllByTestId('scoreboard-row');
  const rowOf = (name: string) => rows().find((row) => within(row).queryByText(name) !== null) as HTMLElement;
  const cells = (row: HTMLElement) => Array.from(row.querySelectorAll('td')).slice(1).map((cell) => cell.textContent); // after the index
  const index = (row: HTMLElement) => row.querySelector('td')?.textContent;
  const played = [game(1, ['a'], ['b'], [21, 18]), game(2, ['a'], ['c'], [21, 10]), game(3, ['b'], ['c'], [21, 19])];

  it('shows the whole session above the list: a row per joined player, in the configured columns and order', async () => {
    renderSection({ schema: custom, records: played, playerIds: ['a', 'b', 'c', 'd'] });
    await open();
    const headers = within(screen.getByTestId('result-scoreboard')).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['#', 'Player', 'Games', 'Won', 'Lost', 'Win +/-', 'Points +/-']);
    // the index numbers the rows in the order shown, from 1
    expect(rows().map(index)).toEqual(['1', '2', '3', '4']);
    expect(rows().map((row) => within(row).getByRole('rowheader').textContent)).toEqual([
      'Alice Nguyen', 'Bob Tran', 'Carolina Fernandez', 'Dan Pham',
    ]);
    expect(cells(rowOf('Alice Nguyen'))).toEqual(['2', '2', '0', '+2', '+14']);
    expect(cells(rowOf('Carolina Fernandez'))).toEqual(['2', '0', '2', '-2', '-13']);
  });

  it('shows "-" for a joined player who has not played', async () => {
    renderSection({ schema: custom, records: played, playerIds: ['a', 'b', 'c', 'd'] });
    await open();
    expect(cells(rowOf('Dan Pham'))).toEqual(['-', '-', '-', '-', '-']);
  });

  it('keeps a player who left, as "Former player", with their games', async () => {
    renderSection({ schema: custom, records: played, playerIds: ['a', 'b'], names: new Map([['a', { name: 'Alice Nguyen', avatarUrl: null }], ['b', { name: 'Bob Tran', avatarUrl: null }]]) });
    await open();
    expect(cells(rowOf('Former player'))).toEqual(['2', '0', '2', '-2', '-13']);
  });

  it('highlights the current user row and marks it "You"', async () => {
    renderSection({ records: played, currentUserId: 'b' });
    await open();
    expect(rowOf('Bob Tran')).toHaveAttribute('aria-current', 'true');
    expect(within(rowOf('Bob Tran')).getByText('(You)')).toBeInTheDocument();
    expect(rowOf('Alice Nguyen')).not.toHaveAttribute('aria-current');
  });

  it('is the whole session: the "my results" switch does not change it', async () => {
    renderSection({ schema: custom, records: played, currentUserId: 'a' });
    await open();
    await userEvent.setup().click(screen.getByRole('switch', { name: /my/i }));
    expect(rows()).toHaveLength(5);
    expect(cells(rowOf('Bob Tran'))).toEqual(['2', '1', '1', '0', '-1']);
  });

  it('draws the badminton schema as configured: index, player, games, won, lost, win +/-', async () => {
    renderSection({ records: played, playerIds: ['a', 'b', 'c', 'd'] });
    await open();
    const headers = within(screen.getByTestId('result-scoreboard')).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['#', 'Player', 'Games', 'Won', 'Lost', 'Win +/-']);
    expect(cells(rowOf('Alice Nguyen'))).toEqual(['2', '2', '0', '+2']);
  });

  it('is also shown while the section is collapsed, above the latest records', () => {
    renderSection({ records: played });
    expect(screen.getByTestId('result-scoreboard')).toBeInTheDocument();
  });

  it('draws a column title the sport set, in the language of the viewer', async () => {
    renderSection({ schema: custom, records: played, locale: 'vi' });
    await open();
    expect(screen.getByRole('columnheader', { name: 'Hiệu số điểm' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Games' })).toBeInTheDocument(); // a column the sport did not retitle keeps the client default
  });

  it('is not shown without a valid record, or when the sport switches it off', async () => {
    renderSection({ records: [broken] });
    expect(screen.queryByTestId('result-scoreboard')).not.toBeInTheDocument();
    cleanup();
    renderSection({ records: played, schema: { ...schema, scoreboard: { ...schema.scoreboard, enabled: false } } });
    expect(screen.queryByTestId('result-scoreboard')).not.toBeInTheDocument();
  });
});

describe('SessionResultSection scoreboard folding and place (CLIENT-GL-49)', () => {
  const toggle = () => within(screen.getByTestId('result-scoreboard')).getByRole('button', { name: /Scoreboard/ });
  const table = () => within(screen.getByTestId('result-scoreboard')).queryByRole('table');
  const played = [game(1, ['a'], ['b']), game(2, ['a'], ['c'])];

  it('is open by default', async () => {
    renderSection({ records: played });
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(table()).not.toBeNull();
    await open();
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(table()).not.toBeNull();
  });

  it('folds and unfolds from its title bar, which stays visible', async () => {
    const user = userEvent.setup();
    renderSection({ records: played });
    await user.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(table()).toBeNull();
    expect(screen.getByTestId('result-scoreboard')).toBeInTheDocument();
    await user.click(toggle());
    expect(table()).not.toBeNull();
  });

  it('keeps its state when the section opens and closes', async () => {
    const user = userEvent.setup();
    renderSection({ records: played });
    await user.click(toggle());
    await open();
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(table()).toBeNull();
  });

  it('sits below the record list, collapsed and open', async () => {
    renderSection({ records: played });
    const after = () =>
      Boolean(screen.getAllByTestId('record-card').at(-1)!.compareDocumentPosition(screen.getByTestId('result-scoreboard')) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(after()).toBe(true);
    await open();
    expect(after()).toBe(true);
  });

  it('is still below the empty hint when the my-results switch leaves no record', async () => {
    renderSection({ records: played, currentUserId: 'd' });
    await userEvent.setup().click(screen.getByRole('switch', { name: /my/i }));
    expect(screen.getAllByText('None of the results include you.').length).toBeGreaterThan(0);
    expect(screen.getByTestId('result-scoreboard')).toBeInTheDocument();
  });
});
