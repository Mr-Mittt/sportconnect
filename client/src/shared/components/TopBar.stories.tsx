import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { TopBar } from './TopBar';

const meta = {
  title: 'Shared/TopBar',
  component: TopBar,
  args: {
    user: { initials: 'JL', name: 'Jordan Lee', email: 'jordan@example.com' },
    onLogout: () => {},
  },
} satisfies Meta<typeof TopBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AccountMenuOpen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Your account' }));
  },
};
