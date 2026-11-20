import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SharePerson } from '../types';
import { SHARE_LIMIT } from '../hooks/useShareSession';
import { ShareSessionDialog } from './ShareSessionDialog';

// The real limit is 50 (asserted in useShareSession.test.tsx, enforced by the server, and driven end to end by the e2e spec).
// Here it is 3: fifty re-renders of fifty rows take longer than a unit test should, and the logic is the same at any number.
vi.mock('../hooks/useShareSession', () => ({ SHARE_LIMIT: 3 }));

// CLIENT-SESSION-49: the "Share with friends" dialog.

function friend(id: string, fullName: string): SharePerson {
  return { id, fullName, avatarUrl: null };
}

const alice = friend('u-alice', 'Alice Nguyen');
const bao = friend('u-bao', 'Bảo Trần');
const chi = friend('u-chi', 'Chi Pham');
const dung = friend('u-dung', 'Dũng Lê');

/** `count` friends, "Friend 001" ... in order. */
function manyFriends(count: number): SharePerson[] {
  return Array.from({ length: count }, (_, i) => friend(`m-${i + 1}`, `Friend ${String(i + 1).padStart(3, '0')}`));
}

type Props = React.ComponentProps<typeof ShareSessionDialog>;

function renderDialog(overrides: Partial<Props> = {}) {
  const props: Props = {
    isOpen: true,
    onClose: vi.fn(),
    kind: 'friends',
    people: [alice, bao, chi, dung],
    isPeopleLoading: false,
    isPeopleError: false,
    hasMore: false,
    isFetchingMore: false,
    onLoadMore: vi.fn(),
    joinedIds: new Set<string>(),
    onShare: vi.fn((_ids: string[], onDone: () => void) => onDone()),
    isSharing: false,
    isShareError: false,
    ...overrides,
  };
  render(<ShareSessionDialog {...props} />);
  return props;
}

const box = (name: string) => screen.getByRole('checkbox', { name: `Select ${name}` });
const shareButton = (count: number) => screen.getByRole('button', { name: `Share (${count})` });

describe('ShareSessionDialog: the list', () => {
  it('has a centered title, and lists every friend', () => {
    renderDialog();
    expect(screen.getByRole('dialog', { name: 'Share with friends' })).toBeInTheDocument();
    for (const name of ['Alice Nguyen', 'Bảo Trần', 'Chi Pham', 'Dũng Lê']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it('lists the friends who have not joined first, each with a checkbox, and the joined ones below with "Joined" and no checkbox', () => {
    renderDialog({ joinedIds: new Set(['u-alice', 'u-chi']) });

    const rows = screen.getAllByRole('listitem').map((row) => row.textContent);
    // Not joined first (Bảo, Dũng, in the list's own order), then joined (Alice, Chi).
    expect(rows[0]).toContain('Bảo Trần');
    expect(rows[1]).toContain('Dũng Lê');
    expect(rows[2]).toContain('Alice Nguyen');
    expect(rows[2]).toContain('Joined');
    expect(rows[3]).toContain('Chi Pham');
    expect(rows[3]).toContain('Joined');

    expect(box('Bảo Trần')).toBeInTheDocument();
    expect(box('Dũng Lê')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Select Alice Nguyen' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Select Chi Pham' })).toBeNull();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('filters by name with the app rule: word-start, accent-insensitive, from the first character', async () => {
    const user = userEvent.setup();
    renderDialog({ joinedIds: new Set(['u-chi']) });

    await user.type(screen.getByRole('textbox', { name: 'Search your friends' }), 'bao');
    expect(screen.getByText('Bảo Trần')).toBeInTheDocument();
    expect(screen.queryByText('Alice Nguyen')).toBeNull();
    expect(screen.queryByText('Chi Pham')).toBeNull();

    await user.clear(screen.getByRole('textbox', { name: 'Search your friends' }));
    await user.type(screen.getByRole('textbox', { name: 'Search your friends' }), 'ph');
    // "Pham" starts with "ph": the joined friend matches too and still shows "Joined".
    expect(within(screen.getByRole('listitem')).getByText('Joined')).toBeInTheDocument();
  });

  it('shows a hint when no friend matches the filter, and keeps the ticks made before filtering', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(box('Alice Nguyen'));
    await user.type(screen.getByRole('textbox', { name: 'Search your friends' }), 'zzz');
    expect(screen.getByText('No friends found.')).toBeInTheDocument();

    await user.clear(screen.getByRole('textbox', { name: 'Search your friends' }));
    expect(box('Alice Nguyen')).toBeChecked();
    expect(shareButton(1)).toBeInTheDocument();
  });

  it('shows a hint, and no filter box, when the caller has no friends', () => {
    renderDialog({ people: [] });
    expect(screen.getByText('You have no friends to share with yet.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(shareButton(0)).toBeDisabled();
  });

  it('shows loading while the friend list loads', () => {
    renderDialog({ people: [], isPeopleLoading: true });
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('says so when the friend list could not be loaded', () => {
    renderDialog({ people: [], isPeopleError: true });
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load your friends.");
  });
});

describe('ShareSessionDialog: ticking and sending', () => {
  it('starts with "Share (0)" disabled and counts the ticked friends', async () => {
    const user = userEvent.setup();
    renderDialog();
    expect(shareButton(0)).toBeDisabled();

    await user.click(box('Alice Nguyen'));
    await user.click(box('Chi Pham'));
    expect(shareButton(2)).toBeEnabled();

    await user.click(box('Alice Nguyen'));
    expect(shareButton(1)).toBeEnabled();
    await user.click(box('Chi Pham'));
    expect(shareButton(0)).toBeDisabled();
  });

  it('a click on the friend\'s name ticks the box too', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Chi Pham'));
    expect(box('Chi Pham')).toBeChecked();
    expect(shareButton(1)).toBeInTheDocument();
  });

  it('sends exactly the ticked ids, once', async () => {
    const user = userEvent.setup();
    const props = renderDialog();
    await user.click(box('Chi Pham'));
    await user.click(box('Alice Nguyen'));
    await user.click(shareButton(2));
    expect(props.onShare).toHaveBeenCalledTimes(1);
    expect(props.onShare).toHaveBeenCalledWith(expect.arrayContaining(['u-alice', 'u-chi']), expect.any(Function));
    expect((props.onShare as ReturnType<typeof vi.fn>).mock.calls[0][0]).toHaveLength(2);
  });

  it('after a send: the dialog stays open with a generic line, the sent friends stay ticked but disabled, and the count restarts', async () => {
    const user = userEvent.setup();
    const props = renderDialog();
    await user.click(box('Alice Nguyen'));
    await user.click(box('Chi Pham'));
    await user.click(shareButton(2));

    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Share with friends' })).toBeInTheDocument();
    expect(screen.getByText('Session shared.')).toBeInTheDocument();
    // The line is generic, with no count: `sent` can be lower than the ticks.
    expect(box('Alice Nguyen')).toBeChecked();
    expect(box('Alice Nguyen')).toBeDisabled();
    expect(box('Chi Pham')).toBeChecked();
    expect(box('Chi Pham')).toBeDisabled();
    expect(box('Bảo Trần')).not.toBeChecked();
    expect(box('Bảo Trần')).toBeEnabled();
    expect(shareButton(0)).toBeDisabled();
  });

  it('a new tick after a send counts only the new friend, sends only them, and clears the confirmation', async () => {
    const user = userEvent.setup();
    const props = renderDialog();
    await user.click(box('Alice Nguyen'));
    await user.click(shareButton(1));
    expect(screen.getByText('Session shared.')).toBeInTheDocument();

    await user.click(box('Dũng Lê'));
    expect(screen.queryByText('Session shared.')).toBeNull();
    expect(shareButton(1)).toBeEnabled();

    await user.click(shareButton(1));
    expect((props.onShare as ReturnType<typeof vi.fn>).mock.calls[1][0]).toEqual(['u-dung']);
    expect(box('Alice Nguyen')).toBeDisabled();
    expect(box('Dũng Lê')).toBeDisabled();
  });

  it('a failed send keeps the ticks (nothing becomes "sent") and shows the generic error', async () => {
    const user = userEvent.setup();
    // onShare that never calls onDone, as a failed request does.
    const props = renderDialog({ onShare: vi.fn(), isShareError: true });
    await user.click(box('Alice Nguyen'));
    await user.click(shareButton(1));

    expect(props.onShare).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't share this session. Try again.");
    expect(screen.queryByText('Session shared.')).toBeNull();
    expect(box('Alice Nguyen')).toBeChecked();
    expect(box('Alice Nguyen')).toBeEnabled();
    expect(shareButton(1)).toBeEnabled();
  });

  it('shows "Sharing…" and disables the button while the request is in flight', async () => {
    const user = userEvent.setup();
    renderDialog({ isSharing: true });
    await user.click(box('Alice Nguyen'));
    expect(screen.getByRole('button', { name: 'Sharing…' })).toBeDisabled();
  });

  it('the close button asks the host to close', async () => {
    const user = userEvent.setup();
    const props = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('renders nothing while closed', () => {
    renderDialog({ isOpen: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('ShareSessionDialog: the limit of one sharing turn', () => {
  const warning = 'You reached the limit of one sharing turn.';
  const name = (index: number) => `Friend ${String(index).padStart(3, '0')}`;
  /** Two more friends than the limit, so there are always unticked ones left at the limit. */
  const friends = () => manyFriends(SHARE_LIMIT + 2);

  it('uses a limit of 3 in these tests', () => {
    expect(SHARE_LIMIT).toBe(3);
  });

  it('shows no warning and keeps every box enabled up to one below the limit', async () => {
    const user = userEvent.setup();
    renderDialog({ people: friends() });
    for (let i = 1; i < SHARE_LIMIT; i += 1) await user.click(box(name(i)));

    expect(screen.queryByText(warning)).toBeNull();
    expect(box(name(SHARE_LIMIT))).toBeEnabled();
    expect(box(name(SHARE_LIMIT + 1))).toBeEnabled();
  });

  it('at the limit shows the footer warning and disables every unticked box, while ticked ones stay enabled', async () => {
    const user = userEvent.setup();
    renderDialog({ people: friends() });
    for (let i = 1; i <= SHARE_LIMIT; i += 1) await user.click(box(name(i)));

    expect(screen.getByText(warning)).toBeInTheDocument();
    expect(shareButton(SHARE_LIMIT)).toBeEnabled();
    expect(box(name(SHARE_LIMIT + 1))).toBeDisabled();
    expect(box(name(SHARE_LIMIT + 2))).toBeDisabled();
    expect(box(name(1))).toBeEnabled();
    expect(box(name(SHARE_LIMIT))).toBeEnabled();
  });

  it('a disabled box at the limit cannot be ticked', async () => {
    const user = userEvent.setup();
    renderDialog({ people: friends() });
    for (let i = 1; i <= SHARE_LIMIT; i += 1) await user.click(box(name(i)));

    await user.click(box(name(SHARE_LIMIT + 1)));

    expect(box(name(SHARE_LIMIT + 1))).not.toBeChecked();
    expect(shareButton(SHARE_LIMIT)).toBeInTheDocument();
  });

  it('un-ticking one at the limit lifts the warning and re-enables the others', async () => {
    const user = userEvent.setup();
    renderDialog({ people: friends() });
    for (let i = 1; i <= SHARE_LIMIT; i += 1) await user.click(box(name(i)));

    await user.click(box(name(2)));

    expect(screen.queryByText(warning)).toBeNull();
    expect(shareButton(SHARE_LIMIT - 1)).toBeEnabled();
    expect(box(name(SHARE_LIMIT + 1))).toBeEnabled();
  });

  it('friends already sent to do not count toward the limit of the next turn', async () => {
    const user = userEvent.setup();
    const props = renderDialog({ people: friends() });
    for (let i = 1; i <= SHARE_LIMIT; i += 1) await user.click(box(name(i)));
    await user.click(shareButton(SHARE_LIMIT));
    expect((props.onShare as ReturnType<typeof vi.fn>).mock.calls[0][0]).toHaveLength(SHARE_LIMIT);

    // A fresh turn: no warning, the unsent friends are enabled, the sent ones are ticked and disabled.
    expect(screen.queryByText(warning)).toBeNull();
    expect(box(name(SHARE_LIMIT + 1))).toBeEnabled();
    expect(box(name(1))).toBeDisabled();
    await user.click(box(name(SHARE_LIMIT + 1)));
    expect(shareButton(1)).toBeEnabled();
  });
});

// CLIENT-GROUP-SESSION-3: the same dialog for a group session lists the group's members, 100 at a time.
describe('ShareSessionDialog: a group session (CLIENT-GROUP-SESSION-3)', () => {
  const groupProps = (overrides: Partial<Props> = {}): Partial<Props> => ({
    kind: 'group',
    people: [alice, bao, chi, dung],
    ...overrides,
  });

  it('is titled "Share with group members" and lists the members, with its own search label and placeholder', () => {
    renderDialog(groupProps());
    expect(screen.getByRole('dialog', { name: 'Share with group members' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Share with friends' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: "Search the group's members" })).toHaveAttribute('placeholder', 'Search members');
    for (const name of ['Alice Nguyen', 'Bảo Trần', 'Chi Pham', 'Dũng Lê']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it('keeps the joined mark, the checkbox rule and the Share (x) count of the friends dialog', async () => {
    const user = userEvent.setup();
    const props = renderDialog(groupProps({ joinedIds: new Set(['u-alice']) }));
    const rows = screen.getAllByRole('listitem').map((row) => row.textContent);
    expect(rows[3]).toContain('Alice Nguyen');
    expect(rows[3]).toContain('Joined');
    expect(screen.queryByRole('checkbox', { name: 'Select Alice Nguyen' })).toBeNull();

    await user.click(box('Bảo Trần'));
    await user.click(box('Chi Pham'));
    await user.click(shareButton(2));
    expect(props.onShare).toHaveBeenCalledWith(['u-bao', 'u-chi'], expect.any(Function));
  });

  it('filters the members already loaded by name, on the client (no request is made by the dialog)', async () => {
    const user = userEvent.setup();
    renderDialog(groupProps());
    await user.type(screen.getByRole('textbox', { name: "Search the group's members" }), 'bao');
    expect(screen.getByText('Bảo Trần')).toBeInTheDocument();
    expect(screen.queryByText('Alice Nguyen')).not.toBeInTheDocument();

    await user.clear(screen.getByRole('textbox', { name: "Search the group's members" }));
    await user.type(screen.getByRole('textbox', { name: "Search the group's members" }), 'zzz');
    expect(screen.getByText('No members found.')).toBeInTheDocument();
  });

  it('has a "Load more members" while there is another page, and it asks for it', async () => {
    const user = userEvent.setup();
    const props = renderDialog(groupProps({ hasMore: true }));
    await user.click(screen.getByRole('button', { name: 'Load more members' }));
    expect(props.onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('has no "Load more members" on the last page, and never one for friends', () => {
    renderDialog(groupProps({ hasMore: false }));
    expect(screen.queryByRole('button', { name: 'Load more members' })).not.toBeInTheDocument();
  });

  it('never shows the Load more for a friend list, even if hasMore were set', () => {
    renderDialog({ kind: 'friends', hasMore: true });
    expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument();
  });

  it('keeps the Load more when the filter matches nothing among the members loaded so far', async () => {
    const user = userEvent.setup();
    renderDialog(groupProps({ hasMore: true }));
    await user.type(screen.getByRole('textbox', { name: "Search the group's members" }), 'zzz');
    expect(screen.getByText('No members found.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load more members' })).toBeInTheDocument();
  });

  it('disables the Load more while a page is loading', () => {
    renderDialog(groupProps({ hasMore: true, isFetchingMore: true }));
    expect(screen.getByRole('button', { name: 'Load more members' })).toBeDisabled();
  });

  it('shows its own hints: no other member yet, and a load error', () => {
    renderDialog(groupProps({ people: [] }));
    expect(screen.getByText('There are no other members to share with yet.')).toBeInTheDocument();
  });

  it('shows the members load error line', () => {
    renderDialog(groupProps({ people: [], isPeopleError: true }));
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load the group's members.");
  });

  it('stops at the same limit of one turn as for friends', async () => {
    const user = userEvent.setup();
    renderDialog(groupProps({ people: manyFriends(SHARE_LIMIT + 2) }));
    for (let i = 1; i <= SHARE_LIMIT; i += 1) await user.click(box(`Friend ${String(i).padStart(3, '0')}`));
    expect(screen.getByText('You reached the limit of one sharing turn.')).toBeInTheDocument();
    expect(box(`Friend ${String(SHARE_LIMIT + 1).padStart(3, '0')}`)).toBeDisabled();
  });
});
