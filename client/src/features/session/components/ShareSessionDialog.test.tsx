import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { FriendUser } from '@/features/friends/types';
import { SHARE_LIMIT } from '../hooks/useShareSession';
import { ShareSessionDialog } from './ShareSessionDialog';

// The real limit is 50 (asserted in useShareSession.test.tsx, enforced by the server, and driven end to end by the e2e spec).
// Here it is 3: fifty re-renders of fifty rows take longer than a unit test should, and the logic is the same at any number.
vi.mock('../hooks/useShareSession', () => ({ SHARE_LIMIT: 3 }));

// CLIENT-SESSION-49: the "Share with friends" dialog.

function friend(id: string, fullName: string): FriendUser {
  return { id, fullName, avatarUrl: null, coverUrl: null, bio: null };
}

const alice = friend('u-alice', 'Alice Nguyen');
const bao = friend('u-bao', 'Bảo Trần');
const chi = friend('u-chi', 'Chi Pham');
const dung = friend('u-dung', 'Dũng Lê');

/** `count` friends, "Friend 001" ... in order. */
function manyFriends(count: number): FriendUser[] {
  return Array.from({ length: count }, (_, i) => friend(`m-${i + 1}`, `Friend ${String(i + 1).padStart(3, '0')}`));
}

type Props = React.ComponentProps<typeof ShareSessionDialog>;

function renderDialog(overrides: Partial<Props> = {}) {
  const props: Props = {
    isOpen: true,
    onClose: vi.fn(),
    friends: [alice, bao, chi, dung],
    isFriendsLoading: false,
    isFriendsError: false,
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
    renderDialog({ friends: [] });
    expect(screen.getByText('You have no friends to share with yet.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(shareButton(0)).toBeDisabled();
  });

  it('shows loading while the friend list loads', () => {
    renderDialog({ friends: [], isFriendsLoading: true });
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('says so when the friend list could not be loaded', () => {
    renderDialog({ friends: [], isFriendsError: true });
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
    renderDialog({ friends: friends() });
    for (let i = 1; i < SHARE_LIMIT; i += 1) await user.click(box(name(i)));

    expect(screen.queryByText(warning)).toBeNull();
    expect(box(name(SHARE_LIMIT))).toBeEnabled();
    expect(box(name(SHARE_LIMIT + 1))).toBeEnabled();
  });

  it('at the limit shows the footer warning and disables every unticked box, while ticked ones stay enabled', async () => {
    const user = userEvent.setup();
    renderDialog({ friends: friends() });
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
    renderDialog({ friends: friends() });
    for (let i = 1; i <= SHARE_LIMIT; i += 1) await user.click(box(name(i)));

    await user.click(box(name(SHARE_LIMIT + 1)));

    expect(box(name(SHARE_LIMIT + 1))).not.toBeChecked();
    expect(shareButton(SHARE_LIMIT)).toBeInTheDocument();
  });

  it('un-ticking one at the limit lifts the warning and re-enables the others', async () => {
    const user = userEvent.setup();
    renderDialog({ friends: friends() });
    for (let i = 1; i <= SHARE_LIMIT; i += 1) await user.click(box(name(i)));

    await user.click(box(name(2)));

    expect(screen.queryByText(warning)).toBeNull();
    expect(shareButton(SHARE_LIMIT - 1)).toBeEnabled();
    expect(box(name(SHARE_LIMIT + 1))).toBeEnabled();
  });

  it('friends already sent to do not count toward the limit of the next turn', async () => {
    const user = userEvent.setup();
    const props = renderDialog({ friends: friends() });
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
