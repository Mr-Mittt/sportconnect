import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ImportApplyResult, ImportCandidate, ImportPreviewSession } from '../types';
import { ImportPreviewTable } from './ImportPreviewTable';
import { ImportResultPanel } from './ImportResultPanel';
import { UnresolvedNamesPanel } from './UnresolvedNamesPanel';

const members: ImportCandidate[] = [
  { userId: 'u-anh-a', fullName: 'Ánh Nguyễn' },
  { userId: 'u-anh-b', fullName: 'Ánh Vãng Lai' },
  { userId: 'u-bao', fullName: 'Bảo Nguyễn' },
  { userId: 'u-hieu', fullName: 'Hiếu Nguyễn' },
];

const player = (name: string, userId?: string, fullName?: string) => ({ name, userId: userId ?? null, fullName: fullName ?? null });

const sessions: ImportPreviewSession[] = [
  {
    title: "BkBg's session on 29th, Oct 2026", localDate: '2026-10-29', scheduledStart: '2026-10-29T00:00:00Z', scheduledEndAt: '2026-10-29T02:00:00Z',
    exists: false,
    games: [
      { winners: [player('Hiếu', 'u-hieu', 'Hiếu Nguyễn'), player('Anh_VL')], losers: [player('Bảo', 'u-bao', 'Bảo Nguyễn')] },
      { winners: [player('Bảo', 'u-bao', 'Bảo Nguyễn')], losers: [player('Hiếu', 'u-hieu', 'Hiếu Nguyễn')] },
    ],
  },
  {
    title: "BkBg's session on 27th, Oct 2026", localDate: '2026-10-27', scheduledStart: '2026-10-27T00:00:00Z', scheduledEndAt: '2026-10-27T02:00:00Z',
    exists: true,
    games: [{ winners: [player('Hiếu', 'u-hieu', 'Hiếu Nguyễn')], losers: [player('Bảo', 'u-bao', 'Bảo Nguyễn')] }],
  },
];

describe('ImportPreviewTable', () => {
  it('lists each session with its date, title and number of games', () => {
    render(<ImportPreviewTable sessions={sessions} aliases={{}} members={members} />);
    const rows = within(screen.getByRole('list', { name: 'Sessions to import' })).getAllByRole('button');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('2026-10-29');
    expect(rows[0]).toHaveTextContent("BkBg's session on 29th, Oct 2026");
    expect(rows[0]).toHaveTextContent('2 games');
    expect(rows[1]).toHaveTextContent('1 game');
  });

  it('opens a session to its games, winners first, and closes it again', async () => {
    render(<ImportPreviewTable sessions={sessions} aliases={{}} members={members} />);
    const first = screen.getAllByRole('button')[0];
    expect(first).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(first);

    expect(first).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/Hiếu Nguyễn, Anh_VL \(not matched\)/)).toBeInTheDocument();
    expect(screen.getAllByText(/beat/)).toHaveLength(2);
    await userEvent.click(first);
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/beat/)).not.toBeInTheDocument();
  });

  it('marks a session the group already has', () => {
    render(<ImportPreviewTable sessions={sessions} aliases={{}} members={members} />);
    const rows = screen.getAllByRole('button');
    expect(rows[1]).toHaveTextContent('Already imported');
    expect(rows[0]).not.toHaveTextContent('Already imported');
  });

  it('shows the member chosen for an unmatched name instead of "not matched"', async () => {
    render(<ImportPreviewTable sessions={sessions} aliases={{ Anh_VL: 'u-anh-b' }} members={members} />);
    await userEvent.click(screen.getAllByRole('button')[0]);
    expect(screen.getByText(/Hiếu Nguyễn, Ánh Vãng Lai/)).toBeInTheDocument();
    expect(screen.queryByText(/not matched/)).not.toBeInTheDocument();
  });
});

describe('UnresolvedNamesPanel', () => {
  const unresolved = [
    { name: 'Ánh', candidates: [members[0], members[1]] },
    { name: 'Anh_VL', candidates: [] },
  ];

  it('has a dropdown per name, the members with the same first name first, then everyone else', () => {
    render(<UnresolvedNamesPanel unresolved={unresolved} members={members} aliases={{}} onChoose={() => {}} />);
    const anh = screen.getByLabelText('Who is "Ánh"?');
    const groups = within(anh).getAllByRole('group');
    expect(groups.map((g) => g.getAttribute('label'))).toEqual(['Same first name', 'All members']);
    expect(within(groups[0]).getAllByRole('option').map((o) => o.textContent)).toEqual(['Ánh Nguyễn', 'Ánh Vãng Lai']);
    expect(within(groups[1]).getAllByRole('option').map((o) => o.textContent)).toEqual(['Bảo Nguyễn', 'Hiếu Nguyễn']);
  });

  it('offers every member for a name nobody matched, and says so', () => {
    render(<UnresolvedNamesPanel unresolved={unresolved} members={members} aliases={{}} onChoose={() => {}} />);
    const vl = screen.getByLabelText('Who is "Anh_VL"?');
    expect(within(vl).queryByRole('group', { name: 'Same first name' })).not.toBeInTheDocument();
    expect(within(vl).getAllByRole('option')).toHaveLength(members.length + 1);
    expect(screen.getByText('No member has this first name.')).toBeInTheDocument();
  });

  it('reports the member chosen, by the name as written, and the choice going back to none', async () => {
    const onChoose = vi.fn();
    render(<UnresolvedNamesPanel unresolved={unresolved} members={members} aliases={{ Anh_VL: 'u-anh-b' }} onChoose={onChoose} />);
    expect(screen.getByLabelText('Who is "Anh_VL"?')).toHaveValue('u-anh-b');

    await userEvent.selectOptions(screen.getByLabelText('Who is "Ánh"?'), 'u-anh-a');
    expect(onChoose).toHaveBeenCalledWith('Ánh', 'u-anh-a');
    await userEvent.selectOptions(screen.getByLabelText('Who is "Anh_VL"?'), '');
    expect(onChoose).toHaveBeenCalledWith('Anh_VL', '');
  });
});

describe('ImportResultPanel', () => {
  const result: ImportApplyResult = {
    created: 1, skipped: 1, failed: 1,
    results: [
      { title: 'A', localDate: '2026-10-29', status: 'CREATED', sessionId: 5 },
      { title: 'B', localDate: '2026-10-27', status: 'SKIPPED' },
      { title: 'C', localDate: '2026-10-24', status: 'FAILED' },
    ],
  };

  it('gives the counts and one line per session with its outcome in words', () => {
    render(<ImportResultPanel result={result} />);
    expect(screen.getByRole('status')).toHaveTextContent('Imported 1, already imported 1, failed 1.');
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Imported');
    expect(items[1]).toHaveTextContent('Already imported');
    expect(items[2]).toHaveTextContent('Failed');
  });

  it('explains how to retry only when something failed', () => {
    const { rerender } = render(<ImportResultPanel result={result} />);
    expect(screen.getByText(/Apply again to retry them/)).toBeInTheDocument();
    rerender(<ImportResultPanel result={{ ...result, failed: 0, results: result.results.slice(0, 2) }} />);
    expect(screen.queryByText(/Apply again/)).not.toBeInTheDocument();
  });
});
