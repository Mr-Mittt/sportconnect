import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { TopBar } from './TopBar';

const meta = {
  title: 'Shared/TopBar',
  component: TopBar,
  args: {
    user: { initials: 'JL', name: 'Jordan Lee', email: 'jordan@example.com', avatarUrl: null },
    onLogout: () => {},
    onOpenAccountSettings: () => {},
    // CLIENT-NOTIF-1: TopBar itself no longer owns unreadCount/click-handler
    // props — see Notifications/NotificationBell for the real bell's own
    // stories (open/loading/empty/populated states).
    notificationBell: null,
  },
} satisfies Meta<typeof TopBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// A36: an inline image so the story needs no network (a real avatar is a hotlinked https URL, e.g. a Google picture).
const AVATAR_DATA_URI =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#c2410c"/><circle cx="16" cy="12" r="6" fill="#fff"/><rect x="6" y="21" width="20" height="11" rx="5" fill="#fff"/></svg>');

export const WithAvatar: Story = {
  args: { user: { initials: 'JL', name: 'Jordan Lee', email: 'jordan@example.com', avatarUrl: AVATAR_DATA_URI } },
};

export const AccountMenuOpen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Your account' }));
  },
};

export const AccountMenuOpenWithAvatar: Story = {
  ...WithAvatar,
  play: AccountMenuOpen.play,
};
