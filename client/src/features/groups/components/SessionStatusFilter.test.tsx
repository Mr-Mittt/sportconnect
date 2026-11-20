import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import i18n from '@/app/i18n';
import { SessionStatusFilter } from './SessionStatusFilter';

const OPTIONS = ['ONGOING', 'SCHEDULED', 'PREPARING', 'COMPLETED', 'CANCELLED'] as const;

function setup(selected: (typeof OPTIONS)[number][] = ['ONGOING', 'SCHEDULED']) {
  const onChange = vi.fn();
  render(<SessionStatusFilter sectionLabel="Today's sessions" options={OPTIONS} selected={selected} onChange={onChange} />);
  return onChange;
}

describe('SessionStatusFilter (CLIENT-GROUP-SESSION-2)', () => {
  it('names the filter for its section and shows how many statuses are selected', () => {
    setup(['ONGOING', 'SCHEDULED', 'PREPARING']);
    expect(screen.getByRole('button', { name: "Filter Today's sessions by status" })).toHaveTextContent('Status (3)');
  });

  it('lists every option the section offers as a checkbox row, checked when selected', async () => {
    const user = userEvent.setup();
    setup(['ONGOING', 'SCHEDULED']);
    await user.click(screen.getByRole('button', { name: /Filter/ }));

    const rows = screen.getAllByRole('menuitemcheckbox');
    expect(rows.map((row) => row.textContent)).toEqual(['Ongoing', 'Scheduled', 'Preparing', 'Completed', 'Cancelled']);
    expect(rows.map((row) => row.getAttribute('aria-checked'))).toEqual(['true', 'true', 'false', 'false', 'false']);
  });

  it('ticking a row adds it, in the order of the options, and unticking removes it', async () => {
    const user = userEvent.setup();
    const onChange = setup(['ONGOING', 'CANCELLED']);
    await user.click(screen.getByRole('button', { name: /Filter/ }));

    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Preparing' }));
    expect(onChange).toHaveBeenLastCalledWith(['ONGOING', 'PREPARING', 'CANCELLED']);

    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Ongoing' }));
    expect(onChange).toHaveBeenLastCalledWith(['CANCELLED']);
  });

  it('keeps the menu open after a tick so several can be changed in one go', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: /Filter/ }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Completed' }));
    expect(screen.getAllByRole('menuitemcheckbox')).toHaveLength(5);
  });

  it('can be emptied: unticking the last status reports an empty selection', async () => {
    const user = userEvent.setup();
    const onChange = setup(['COMPLETED']);
    await user.click(screen.getByRole('button', { name: /Filter/ }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Completed' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('is reachable and operable by keyboard', async () => {
    const user = userEvent.setup();
    const onChange = setup(['ONGOING']);
    screen.getByRole('button', { name: /Filter/ }).focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('renders Vietnamese copy when the locale is vi', async () => {
    await i18n.changeLanguage('vi');
    const user = userEvent.setup();
    setup(['ONGOING']);
    const trigger = screen.getByRole('button', { name: "Lọc Today's sessions theo trạng thái" });
    expect(trigger).toHaveTextContent('Trạng thái (1)');
    await user.click(trigger);
    expect(screen.getAllByRole('menuitemcheckbox')[0]).toHaveTextContent('Đang diễn ra');
    await i18n.changeLanguage('en');
  });
});
