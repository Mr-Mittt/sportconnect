import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import { ResetLinkProblem } from './ResetLinkProblem';

const meta = {
  title: 'Auth/ResetLinkProblem',
  component: ResetLinkProblem,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof ResetLinkProblem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Invalid: Story = { args: { errorCode: 'RESET_TOKEN_INVALID' } };
export const AlreadyUsed: Story = { args: { errorCode: 'RESET_TOKEN_USED' } };
export const Expired: Story = { args: { errorCode: 'RESET_TOKEN_EXPIRED' } };
