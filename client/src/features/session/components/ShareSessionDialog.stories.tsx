import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import type { FriendUser } from '@/features/friends/types';
import { SHARE_LIMIT } from '../hooks/useShareSession';
import { ShareSessionDialog } from './ShareSessionDialog';

function friend(id: string, fullName: string): FriendUser {
  return { id, fullName, avatarUrl: null, coverUrl: null, bio: null };
}

const friends: FriendUser[] = [
  friend('f-1', 'Alice Nguyen'),
  friend('f-2', 'Bảo Trần'),
  friend('f-3', 'Chi Pham'),
  friend('f-4', 'Dũng Lê'),
  friend('f-5', 'Priya Shah'),
];

const meta = {
  title: 'Session/ShareSessionDialog',
  component: ShareSessionDialog,
  args: {
    isOpen: true,
    onClose: () => {},
    friends,
    isFriendsLoading: false,
    isFriendsError: false,
    joinedIds: new Set<string>(),
    // Sends successfully at once, like the server answering: the dialog then shows its "Session shared." state.
    onShare: (_userIds: string[], onDone: () => void) => onDone(),
    isSharing: false,
    isShareError: false,
  },
} satisfies Meta<typeof ShareSessionDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nobody ticked: "Share (0)" is disabled. */
export const Default: Story = {};

/** Friends who already joined sit below the others, labelled "Joined", with no checkbox. */
export const WithJoinedFriends: Story = {
  args: { joinedIds: new Set(['f-1', 'f-5']) },
};

/** Two friends ticked: the footer button counts them. */
export const SomeTicked: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByRole('checkbox', { name: 'Select Bảo Trần' }));
    await userEvent.click(await body.findByRole('checkbox', { name: 'Select Chi Pham' }));
  },
};

/** After a send: the generic line shows, the friends just sent to stay ticked but disabled, and the count starts again. */
export const AfterSharing: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByRole('checkbox', { name: 'Select Bảo Trần' }));
    await userEvent.click(await body.findByRole('checkbox', { name: 'Select Chi Pham' }));
    await userEvent.click(await body.findByRole('button', { name: 'Share (2)' }));
  },
};

/** The filter keeps the two lists' order: not joined first. */
export const Filtered: Story = {
  args: { joinedIds: new Set(['f-5']) },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(await body.findByRole('textbox', { name: 'Search your friends' }), 'p');
  },
};

export const NoMatch: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(await body.findByRole('textbox', { name: 'Search your friends' }), 'zzz');
  },
};

export const NoFriends: Story = {
  args: { friends: [] },
};

export const LoadingFriends: Story = {
  args: { friends: [], isFriendsLoading: true },
};

export const FriendsLoadError: Story = {
  args: { friends: [], isFriendsError: true },
};

/** The request is in flight. */
export const Sharing: Story = {
  args: { isSharing: true },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByRole('checkbox', { name: 'Select Bảo Trần' }));
  },
};

/** A failure that is not a session error dialog code: an inline line, the ticks stay. */
export const ShareError: Story = {
  args: { isShareError: true, onShare: () => {} },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByRole('checkbox', { name: 'Select Bảo Trần' }));
  },
};

/** The limit of one sharing turn: the footer warning shows and every unticked box is disabled (ticked ones can still be unticked). */
export const AtTheLimit: Story = {
  args: {
    friends: Array.from({ length: SHARE_LIMIT + 3 }, (_, i) => friend(`m-${i + 1}`, `Friend ${String(i + 1).padStart(3, '0')}`)),
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    for (let i = 1; i <= SHARE_LIMIT; i += 1) {
      await userEvent.click(await body.findByRole('checkbox', { name: `Select Friend ${String(i).padStart(3, '0')}` }), { delay: 0 });
    }
  },
};
