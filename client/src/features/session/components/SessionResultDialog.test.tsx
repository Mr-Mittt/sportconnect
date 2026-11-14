import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import badminton from '../recordSchema/badminton-record-schema-v1.json';
import { parseRecordSchema, type RecordSchema } from '../recordSchema';
import type { PlayerNames } from '../resultDisplay';
import type { RecordChangeSetRequest, RecordOperationResult, SessionRecord } from '../resultTypes';
import { SessionResultDialog } from './SessionResultDialog';

const schema = parseRecordSchema(badminton) as RecordSchema;

const names: PlayerNames = new Map([
  ['a', { name: 'Alice Nguyen', avatarUrl: null }],
  ['b', { name: 'Bob Tran', avatarUrl: null }],
  ['c', { name: 'Carol Le', avatarUrl: null }],
  ['d', { name: 'Dan Pham', avatarUrl: null }],
]);

function record(
  id: number,
  first: string,
  second: string,
  scores: [number | null, number | null],
): SessionRecord {
  return {
    id,
    data: {
      teams: [
        { players: [first], scores: [scores[0]] },
        { players: [second], scores: [scores[1]] },
      ],
    },
    createdBy: 'a',
    createdAt: '2026-08-01T10:00:00Z',
    updatedBy: null,
    updatedAt: '2026-08-01T10:00:00Z',
  };
}

const saved = [record(10, 'a', 'b', [21, 18]), record(11, 'c', 'd', [21, 15])];

function renderDialog(
  overrides: { schema?: RecordSchema; records?: SessionRecord[]; onClose?: () => void } = {},
) {
  const onClose = overrides.onClose ?? vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <SessionResultDialog
        isOpen
        onClose={onClose}
        sessionId={7}
        schema={overrides.schema ?? schema}
        records={overrides.records ?? saved}
        playerIds={['a', 'b', 'c', 'd']}
        names={names}
        locale="en"
      />
    </QueryClientProvider>,
  );
  return { onClose };
}
const rows = () => Array.from(document.querySelectorAll<HTMLElement>('[data-row-status]'));
async function pick(user: ReturnType<typeof userEvent.setup>, trigger: HTMLElement, name: string) {
  await user.click(trigger);
  await user.click(
    within(screen.getByRole('listbox')).getByRole('option', { name: new RegExp(name) }),
  );
}
const save = () => screen.getByRole('button', { name: 'Save' });

function okResponse(results: RecordOperationResult[], records: SessionRecord[]) {
  return { data: { success: true, message: '', timestamp: '', data: { results, records } } };
}

describe('SessionResultDialog', () => {
  let post: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    post = vi.spyOn(apiClient, 'post');
  });
  afterEach(() => vi.restoreAllMocks());

  it('opens with the saved records numbered from 1 and one empty placeholder after them; nothing to save yet', () => {
    renderDialog();
    expect(rows().map((row) => row.dataset.rowStatus)).toEqual([
      'unchanged',
      'unchanged',
      'placeholder',
    ]);
    expect(within(rows()[0]).getByText('#1')).toBeInTheDocument();
    expect(within(rows()[2]).getByText('#3')).toBeInTheDocument();
    expect(save()).toBeDisabled();
    // the placeholder has no action; saved rows start with the red X
    expect(
      within(rows()[2]).queryByRole('button', { name: /Delete result|Undo changes/ }),
    ).toBeNull();
    expect(screen.getByRole('button', { name: 'Delete result 1' })).toBeInTheDocument();
  });

  describe('record row details', () => {
    it('shows the empty slots and score fields with gray italic placeholders while the record is blank', () => {
      renderDialog();
      const row = rows()[2];
      const slot = within(row).getByLabelText('Winner, player 1');
      expect(slot).toHaveTextContent('Add player');
      expect(slot.querySelector('.italic')).toHaveClass('text-text-muted');
      const score = within(row).getByLabelText('Winner, Point') as HTMLInputElement;
      expect(score.placeholder).toBe('Point');
      expect(score.className).toContain('placeholder:italic');
    });

    it('cleans up every placeholder of the record once a player is picked', async () => {
      const user = userEvent.setup();
      renderDialog();
      const row = rows()[2];
      await pick(user, within(row).getByLabelText('Winner, player 1'), 'Carol Le');
      expect(within(row).getByLabelText('Loser, player 1').textContent).toBe('');
      expect(within(row).getByLabelText('Winner, player 2').textContent).toBe('');
      expect((within(row).getByLabelText('Winner, Point') as HTMLInputElement).placeholder).toBe(
        '',
      );
      expect((within(row).getByLabelText('Loser, Point') as HTMLInputElement).placeholder).toBe('');
    });

    it('cleans up the placeholders once a score is typed too', async () => {
      const user = userEvent.setup();
      renderDialog();
      const row = rows()[2];
      await user.type(within(row).getByLabelText('Winner, Point'), '5');
      expect((within(row).getByLabelText('Loser, Point') as HTMLInputElement).placeholder).toBe('');
      expect(within(row).getByLabelText('Winner, player 1').textContent).toBe('');
    });

    it("right-aligns the right team's players and keeps the left team's left", () => {
      renderDialog();
      const cells = Array.from(rows()[0].children) as HTMLElement[];
      expect(
        within(cells[4]).getByLabelText('Loser, player 1').querySelector('.truncate'),
      ).toHaveClass('text-right');
      expect(
        within(cells[1]).getByLabelText('Winner, player 1').querySelector('.truncate'),
      ).toHaveClass('text-left');
    });

    it('shows the avatar and the name of a picked player: avatar then name on the left team, name then avatar on the right', () => {
      renderDialog();
      const cells = Array.from(rows()[0].children) as HTMLElement[];
      const left = within(cells[1]).getByLabelText('Winner, player 1');
      const right = within(cells[4]).getByLabelText('Loser, player 1');
      expect(within(left).getByText('AN')).toBeInTheDocument();
      expect(within(right).getByText('BT')).toBeInTheDocument();
      expect(left.querySelector('span.flex-1')).not.toHaveClass('flex-row-reverse');
      expect(right.querySelector('span.flex-1')).toHaveClass('flex-row-reverse');
      // an empty slot has no avatar
      const emptySlot = within(rows()[2]).getByLabelText('Winner, player 1');
      expect(emptySlot.querySelector('[data-slot="avatar"]')).toBeNull();
    });

    it('marks a missing player like a missing score: only the empty slot the team still needs, with its message centered', async () => {
      const user = userEvent.setup();
      renderDialog();
      const row = rows()[2];
      await pick(user, within(row).getByLabelText('Winner, player 1'), 'Carol Le');
      await user.click(save());
      // the winner has its player: no border on either of its slots; the loser misses one: its first slot only
      expect(within(row).getByLabelText('Winner, player 1')).not.toHaveAttribute('aria-invalid');
      expect(within(row).getByLabelText('Winner, player 2')).not.toHaveAttribute('aria-invalid');
      expect(within(row).getByLabelText('Loser, player 1')).toHaveAttribute('aria-invalid', 'true');
      expect(within(row).getByLabelText('Loser, player 2')).not.toHaveAttribute('aria-invalid');
      expect(screen.getByText('Select the player.').closest('td')).toHaveClass('text-center');
    });
  });

  describe('the player dropdown', () => {
    it('lists the players with their avatar, in the same order as the picked value, in a box with a small radius', async () => {
      const user = userEvent.setup();
      renderDialog();
      const winnerSlot = within(rows()[2]).getByLabelText('Winner, player 1');
      await user.click(winnerSlot);
      const list = screen.getByRole('listbox');
      expect(list).toHaveClass('rounded-md');
      const option = within(list).getByRole('option', { name: /Carol Le/ });
      expect(within(option).getByText('CL')).toBeInTheDocument();
      expect(option).not.toHaveClass('flex-row-reverse');
      expect(option.className).toContain('hover:bg-surface-1');
      await user.click(winnerSlot);
      await user.click(within(rows()[2]).getByLabelText('Loser, player 1'));
      const rightOption = within(screen.getByRole('listbox')).getByRole('option', {
        name: /Carol Le/,
      });
      expect(rightOption).toHaveClass('flex-row-reverse');
      expect(rightOption).toHaveClass('text-right');
    });

    it('puts the red X of "Remove player" before its text on the left team and after it on the right team', async () => {
      const user = userEvent.setup();
      renderDialog();
      const cells = Array.from(rows()[0].children) as HTMLElement[];
      const leftSlot = within(cells[1]).getByLabelText('Winner, player 1');
      await user.click(leftSlot);
      const left = within(screen.getByRole('listbox')).getByRole('option', {
        name: 'Remove player',
      });
      expect(left).not.toHaveClass('flex-row-reverse');
      expect(left.firstElementChild?.getAttribute('class')).toContain('text-text-danger');
      await user.click(leftSlot);
      await user.click(within(cells[4]).getByLabelText('Loser, player 1'));
      const right = within(screen.getByRole('listbox')).getByRole('option', {
        name: 'Remove player',
      });
      expect(right).toHaveClass('flex-row-reverse');
      expect(right.firstElementChild?.getAttribute('class')).toContain('text-text-danger');
    });

    it('closes when focus leaves it', async () => {
      const user = userEvent.setup();
      renderDialog();
      await user.click(within(rows()[2]).getByLabelText('Winner, player 1'));
      expect(screen.getByRole('listbox')).toBeInTheDocument();
      await user.click(screen.getByText('Update results'));
      await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    });
  });

  describe('edited and deleted rows', () => {
    it('gives an edited score or player the focus-colored border, and leaves untouched fields and new rows alone', async () => {
      const user = userEvent.setup();
      renderDialog();
      const first = rows()[0];
      const winnerScore = within(first).getByLabelText('Winner, Point');
      expect(winnerScore).not.toHaveAttribute('data-edited');
      await user.clear(winnerScore);
      await user.type(winnerScore, '25');
      expect(winnerScore).toHaveAttribute('data-edited', 'true');
      expect(winnerScore.className).toContain('border-border-accent');
      expect(within(first).getByLabelText('Loser, Point')).not.toHaveAttribute('data-edited');
      await pick(user, within(first).getByLabelText('Loser, player 1'), 'Dan Pham');
      expect(within(first).getByLabelText('Loser, player 1')).toHaveAttribute(
        'data-edited',
        'true',
      );
      expect(within(first).getByLabelText('Loser, player 1').className).toContain(
        'border-border-accent',
      );
      expect(within(first).getByLabelText('Winner, player 1')).not.toHaveAttribute('data-edited');
      // a new row has nothing saved to differ from
      await pick(user, within(rows()[2]).getByLabelText('Winner, player 1'), 'Carol Le');
      expect(within(rows()[2]).getByLabelText('Winner, player 1')).not.toHaveAttribute(
        'data-edited',
      );
    });

    it('a deleted row keeps showing its record in the same fields, all gray and struck through, and not editable', async () => {
      const user = userEvent.setup();
      renderDialog();
      await user.click(screen.getByRole('button', { name: 'Delete result 1' }));
      const row = rows()[0];
      expect(row).toHaveAttribute('data-testid', 'deleted-record');
      const player = within(row).getByLabelText('Winner, player 1');
      expect(player).toHaveTextContent('Alice Nguyen');
      expect(player).toBeDisabled();
      expect(player.className).toContain('bg-surface-1');
      expect(player.className).toContain('line-through');
      expect(within(row).getByLabelText('Loser, player 1')).toHaveTextContent('Bob Tran');
      for (const label of ['Winner, Point', 'Loser, Point']) {
        const score = within(row).getByLabelText(label);
        expect(score).toBeDisabled();
        expect(score.className).toContain('bg-surface-1');
        expect(score.className).toContain('line-through');
      }
      expect(within(row).getByLabelText('Winner, Point')).toHaveValue(21);
    });
  });

  it('gives both score cells the same width: the dash sits in the gap, not inside one of them', () => {
    renderDialog();
    const cells = Array.from(rows()[0].children) as HTMLElement[];
    expect(cells[2].querySelector('[aria-hidden="true"]')).toHaveClass('absolute');
    expect(cells[3].querySelector('[aria-hidden="true"]')).toBeNull();
    // the paddings differ only on the gap side (0.125rem + 0.5rem each), and both inputs fill their cell
    expect(cells[2]).toHaveClass('pl-0.5', 'pr-2');
    expect(cells[3]).toHaveClass('pl-2', 'pr-0.5');
    expect(within(cells[2]).getByLabelText('Winner, Point')).toHaveClass('w-full');
    expect(within(cells[3]).getByLabelText('Loser, Point')).toHaveClass('w-full');
  });

  it('is a six column table: the Winner and Loser labels (text only, no box) are the 2nd and 5th cells of the first row', () => {
    renderDialog();
    const head = Array.from(document.querySelectorAll('thead tr th')).map(
      (cell) => cell.textContent,
    );
    expect(head).toEqual(['', 'Winner', '', '', 'Loser', '']);
    const label = screen.getByText('Winner');
    expect(label).toHaveClass('text-text-success', 'underline');
    expect(label.className).not.toContain('bg-');
    expect(label.className).not.toContain('border');
  });

  it('keeps the labels on top while the rows scroll', () => {
    renderDialog();
    for (const cell of Array.from(document.querySelectorAll('thead tr th'))) {
      expect(cell).toHaveClass('sticky', 'top-0');
      expect(cell.className).toContain('bg-surface-2');
    }
  });

  it('reads index, team 1, score 1, score 2, team 2, action in each row, in that order', () => {
    renderDialog();
    const cells = Array.from(rows()[0].children) as HTMLElement[];
    expect(cells).toHaveLength(6);
    expect(cells[0]).toHaveTextContent('#1');
    expect(within(cells[1]).getByLabelText('Winner, player 1')).toHaveTextContent('Alice Nguyen');
    expect(within(cells[2]).getByLabelText('Winner, Point')).toHaveValue(21);
    expect(within(cells[3]).getByLabelText('Loser, Point')).toHaveValue(18);
    expect(within(cells[4]).getByLabelText('Loser, player 1')).toHaveTextContent('Bob Tran');
    expect(within(cells[5]).getByRole('button', { name: 'Delete result 1' })).toBeInTheDocument();
  });

  it('puts the winner last (the Loser label in the 2nd cell) when the schema says winnerAlign RIGHT', () => {
    renderDialog({ schema: { ...schema, ui: { ...schema.ui, winnerAlign: 'RIGHT' } } });
    expect(
      Array.from(document.querySelectorAll('thead tr th')).map((cell) => cell.textContent),
    ).toEqual(['', 'Loser', '', '', 'Winner', '']);
    const cells = Array.from(rows()[0].children) as HTMLElement[];
    expect(within(cells[1]).getByLabelText('Loser, player 1')).toHaveTextContent('Bob Tran');
    expect(within(cells[4]).getByLabelText('Winner, player 1')).toHaveTextContent('Alice Nguyen');
  });

  it('removes a player with the first option of a filled dropdown', async () => {
    const user = userEvent.setup();
    renderDialog();
    await pick(user, within(rows()[0]).getByLabelText('Loser, player 1'), 'Remove player');
    expect(rows()[0].dataset.rowStatus).toBe('edited');
    expect(within(rows()[0]).getByLabelText('Loser, player 1').textContent).toBe('');
    await user.click(save());
    expect(screen.getByText('Select the player.')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('is smaller than the session detail: 72vh minus its title bar and composer, so both stay in view', () => {
    renderDialog();
    const box = document.querySelector('[data-slot="dialog-content"]') as HTMLElement;
    expect(box.style.height).toContain('72vh');
    expect(box.style.height).toContain('4.75rem');
    expect(box.style.height).toContain('4.25rem');
  });

  it('centers its title', () => {
    renderDialog();
    expect(screen.getByText('Update results')).toHaveClass('text-center');
  });

  it('delete turns the action into undo; undo restores the row', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('button', { name: 'Delete result 1' }));
    expect(rows()[0].dataset.rowStatus).toBe('deleted');
    expect(screen.queryByRole('button', { name: 'Delete result 1' })).toBeNull();
    expect(save()).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Undo changes to result 1' }));
    expect(rows()[0].dataset.rowStatus).toBe('unchanged');
    expect(within(rows()[0]).getByLabelText('Winner, player 1')).toBeEnabled();
    expect(save()).toBeDisabled();
  });

  it('an edit turns the action into undo, and undo returns to the saved values', async () => {
    const user = userEvent.setup();
    renderDialog();
    const winnerScore = within(rows()[0]).getByLabelText('Winner, Point');
    expect(winnerScore).toHaveValue(21);
    await user.clear(winnerScore);
    await user.type(winnerScore, '25');
    expect(rows()[0].dataset.rowStatus).toBe('edited');
    expect(save()).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Undo changes to result 1' }));
    expect(within(rows()[0]).getByLabelText('Winner, Point')).toHaveValue(21);
    expect(rows()[0].dataset.rowStatus).toBe('unchanged');
    expect(screen.getByRole('button', { name: 'Delete result 1' })).toBeInTheDocument();
  });

  it('taking the placeholder adds a fresh one numbered after it; a new row X removes it and renumbers', async () => {
    const user = userEvent.setup();
    renderDialog();
    const placeholder = rows()[2];
    await pick(user, within(placeholder).getByLabelText('Winner, player 1'), 'Carol Le');
    expect(rows().map((row) => row.dataset.rowStatus)).toEqual([
      'unchanged',
      'unchanged',
      'new',
      'placeholder',
    ]);
    expect(within(rows()[3]).getByText('#4')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete result 3' }));
    expect(rows().map((row) => row.dataset.rowStatus)).toEqual([
      'unchanged',
      'unchanged',
      'placeholder',
    ]);
    expect(within(rows()[2]).getByText('#3')).toBeInTheDocument();
  });

  it('shows no placeholder and a hint once the session holds maxRecords', () => {
    const small = { ...schema, maxRecords: 2 };
    renderDialog({ schema: small });
    expect(rows().map((row) => row.dataset.rowStatus)).toEqual(['unchanged', 'unchanged']);
    expect(
      screen.getByText('This session holds at most 2 results. Remove one to add another.'),
    ).toBeInTheDocument();
  });

  it('marks a score present on one team only with a red border while typing', async () => {
    const user = userEvent.setup();
    renderDialog();
    const loserScore = within(rows()[0]).getByLabelText('Loser, Point');
    await user.clear(loserScore);
    expect(loserScore).toHaveAttribute('aria-invalid', 'true');
    expect(loserScore.className).toContain('border-text-danger');
    // the message sits in the row under it (its own table row)
    expect(screen.getByText('Enter the score.')).toBeInTheDocument();
    // the winner's untouched-by-error cell is fine
    expect(within(rows()[0]).getByLabelText('Winner, Point')).not.toHaveAttribute('aria-invalid');
  });

  it('on Save, marks every problem (a team below the minimum players) and sends nothing', async () => {
    const user = userEvent.setup();
    renderDialog();
    const placeholder = rows()[2];
    await pick(user, within(placeholder).getByLabelText('Winner, player 1'), 'Carol Le');
    // only the winner has a player: the loser team is below the minimum, not yet shown (untouched)
    expect(screen.queryByText('Select the player.')).toBeNull();

    await user.click(save());
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByText('Select the player.')).toBeInTheDocument();
    const loser = within(rows()[2]).getByLabelText('Loser, player 1');
    expect(loser).toHaveAttribute('aria-invalid', 'true');
    expect(loser.className).toContain('border-text-danger');
  });

  it('does not offer a player already in the record in the other dropdowns', async () => {
    const user = userEvent.setup();
    renderDialog();
    const placeholder = rows()[2];
    await pick(user, within(placeholder).getByLabelText('Winner, player 1'), 'Carol Le');
    // Carol is already on the winner team, so she is not offered for the loser team
    await user.click(within(placeholder).getByLabelText('Loser, player 1'));
    const loserOptions = within(screen.getByRole('listbox'));
    expect(loserOptions.queryByRole('option', { name: /Carol Le/ })).toBeNull();
    expect(loserOptions.getByRole('option', { name: /Dan Pham/ })).toBeInTheDocument();
    await user.click(within(placeholder).getByLabelText('Loser, player 1'));
    // her own dropdown still holds her, and offers to clear
    await user.click(within(placeholder).getByLabelText('Winner, player 1'));
    const winnerOptions = within(screen.getByRole('listbox'));
    expect(winnerOptions.getByRole('option', { name: /Carol Le/ })).toBeInTheDocument();
    expect(winnerOptions.getByRole('option', { name: 'Remove player' })).toBeInTheDocument();
  });

  it('Save sends only the diff and stays open when nothing was rejected', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    post.mockImplementation(async (_url: string, body: unknown) => {
      const changes = body as RecordChangeSetRequest;
      return okResponse(
        [
          {
            clientRef: changes.add[0].clientRef,
            requestedId: null,
            id: 12,
            status: 'CREATED',
            errorCode: null,
            errorParams: null,
          },
          {
            clientRef: null,
            requestedId: 10,
            id: null,
            status: 'DELETED',
            errorCode: null,
            errorParams: null,
          },
        ],
        [saved[1], record(12, 'a', 'b', [null, null])],
      );
    });

    await user.click(screen.getByRole('button', { name: 'Delete result 1' }));
    const placeholder = rows()[2];
    await pick(user, within(placeholder).getByLabelText('Winner, player 1'), 'Alice Nguyen');
    await pick(user, within(placeholder).getByLabelText('Loser, player 1'), 'Bob Tran');
    await user.click(save());

    await waitFor(() => expect(post).toHaveBeenCalled());
    await waitFor(() => expect(save()).toBeDisabled());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    const [url, body] = post.mock.calls[0] as [string, RecordChangeSetRequest];
    expect(url).toBe('/sessions/7/records/changes');
    expect(body.delete).toEqual([10]);
    expect(body.update).toEqual([]);
    expect(body.add).toHaveLength(1);
    expect(body.add[0].playerIds).toEqual(['a', 'b']);
    expect(body.add[0].data).toEqual({
      teams: [
        { players: ['a'], scores: [null] },
        { players: ['b'], scores: [null] },
      ],
    });
  });

  it('sends the winner first: a team typed on the wrong side swaps with its score, and the dialog shows it that way after saving', async () => {
    const user = userEvent.setup();
    post.mockImplementation(async (_url: string, body: unknown) => {
      const changes = body as RecordChangeSetRequest;
      const sent = changes.add[0].data as { teams: unknown };
      return okResponse(
        [
          {
            clientRef: changes.add[0].clientRef,
            requestedId: null,
            id: 12,
            status: 'CREATED',
            errorCode: null,
            errorParams: null,
          },
        ],
        [...saved, { ...record(12, 'a', 'b', [null, null]), data: sent as SessionRecord['data'] }],
      );
    });
    renderDialog();
    const placeholder = rows()[2];
    await pick(user, within(placeholder).getByLabelText('Winner, player 1'), 'Carol Le');
    await pick(user, within(placeholder).getByLabelText('Loser, player 1'), 'Dan Pham');
    await user.type(within(placeholder).getByLabelText('Winner, Point'), '15');
    await user.type(within(placeholder).getByLabelText('Loser, Point'), '21');
    await user.click(save());

    await waitFor(() => expect(post).toHaveBeenCalled());
    const body = post.mock.calls[0][1] as RecordChangeSetRequest;
    expect(body.add[0].data).toEqual({
      teams: [
        { players: ['d'], scores: [21] },
        { players: ['c'], scores: [15] },
      ],
    });
    // the saved row now reads winner left: Dan with 21, Carol with 15
    await waitFor(() =>
      expect(within(rows()[2]).getByLabelText('Winner, player 1')).toHaveTextContent('Dan Pham'),
    );
    expect(within(rows()[2]).getByLabelText('Winner, Point')).toHaveValue(21);
    expect(within(rows()[2]).getByLabelText('Loser, player 1')).toHaveTextContent('Carol Le');
    expect(within(rows()[2]).getByLabelText('Loser, Point')).toHaveValue(15);
  });

  it('shows a saved record winner first even when the server answers with the loser first', async () => {
    const user = userEvent.setup();
    post.mockImplementation(async (_url: string, body: unknown) => {
      const changes = body as RecordChangeSetRequest;
      return okResponse(
        [
          {
            clientRef: changes.add[0].clientRef,
            requestedId: null,
            id: 12,
            status: 'CREATED',
            errorCode: null,
            errorParams: null,
          },
        ],
        [...saved, record(12, 'c', 'd', [15, 21])],
      );
    });
    renderDialog();
    const placeholder = rows()[2];
    await pick(user, within(placeholder).getByLabelText('Winner, player 1'), 'Carol Le');
    await pick(user, within(placeholder).getByLabelText('Loser, player 1'), 'Dan Pham');
    await user.type(within(placeholder).getByLabelText('Winner, Point'), '15');
    await user.type(within(placeholder).getByLabelText('Loser, Point'), '21');
    await user.click(save());
    await waitFor(() =>
      expect(within(rows()[2]).getByLabelText('Winner, player 1')).toHaveTextContent('Dan Pham'),
    );
    expect(within(rows()[2]).getByLabelText('Winner, Point')).toHaveValue(21);
  });

  it('opens a record stored with the higher score on the second team winner first, and does not count it as changed', () => {
    renderDialog({ records: [record(10, 'a', 'b', [15, 21])] });
    const row = rows()[0];
    expect(within(row).getByLabelText('Winner, player 1')).toHaveTextContent('Bob Tran');
    expect(within(row).getByLabelText('Winner, Point')).toHaveValue(21);
    expect(within(row).getByLabelText('Loser, player 1')).toHaveTextContent('Alice Nguyen');
    expect(within(row).getByLabelText('Loser, Point')).toHaveValue(15);
    expect(row.dataset.rowStatus).toBe('unchanged');
    expect(save()).toBeDisabled();
  });

  it('keeps a REJECTED row at the bottom with its message and stays open', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    post.mockImplementation(async (_url: string, body: unknown) => {
      const changes = body as RecordChangeSetRequest;
      return okResponse(
        [
          {
            clientRef: changes.add[0].clientRef,
            requestedId: null,
            id: null,
            status: 'REJECTED',
            errorCode: 'SESSION_RECORD_PLAYER_NOT_JOINED',
            errorParams: null,
          },
        ],
        saved,
      );
    });

    const placeholder = rows()[2];
    await pick(user, within(placeholder).getByLabelText('Winner, player 1'), 'Carol Le');
    await pick(user, within(placeholder).getByLabelText('Loser, player 1'), 'Dan Pham');
    await user.click(save());

    await waitFor(() => expect(screen.getByTestId('row-rejection')).toBeInTheDocument());
    expect(screen.getByTestId('row-rejection')).toHaveTextContent(
      "A player in this result hasn't joined the session.",
    );
    expect(onClose).not.toHaveBeenCalled();
    // saved rows first, the rejected row (it keeps #3) next, the placeholder last
    expect(rows().map((row) => row.dataset.rowStatus)).toEqual([
      'unchanged',
      'unchanged',
      'new',
      'placeholder',
    ]);
    expect(within(rows()[2]).getByText('#3')).toBeInTheDocument();
  });

  it('shows a whole-request error from the server and keeps the draft', async () => {
    const user = userEvent.setup();
    renderDialog();
    post.mockRejectedValue(
      Object.assign(new Error('x'), {
        isAxiosError: true,
        response: {
          status: 409,
          data: { message: 'x', errorCode: 'SESSION_RECORD_WINDOW_CLOSED' },
        },
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Delete result 1' }));
    await user.click(save());
    expect(
      await screen.findByText("The 24 hours for changing this session's results have passed."),
    ).toBeInTheDocument();
    expect(rows()[0].dataset.rowStatus).toBe('deleted');
  });

  it('asks before discarding unsaved changes', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Delete result 1' }));
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Discard your changes?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByText('Discard your changes?')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes straight away when nothing changed', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});
