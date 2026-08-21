import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SportResponse } from '@/shared/types/sport';
import { SportCatalogTable } from './SportCatalogTable';

function sport(overrides: Partial<SportResponse> & { id: number; name: string }): SportResponse {
  return {
    description: null,
    category: 'Racket',
    iconUrl: '/images/sports/badminton.png',
    minPlayers: 2,
    maxPlayers: 4,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const sports: SportResponse[] = [
  sport({ id: 1, name: 'Badminton', description: 'Racket sport played over a net.' }),
  sport({ id: 3, name: 'Pickleball', iconUrl: '/images/sports/pickleball.png' }),
  sport({ id: 4, name: 'Tennis', isActive: false, iconUrl: null, category: null }),
  sport({
    id: 5,
    name: 'Squash',
    description:
      'A long description that has to be truncated in the table cell rather than pushing every other column off the edge of the panel.',
    minPlayers: null,
    maxPlayers: null,
  }),
];

const meta = {
  title: 'Admin/SportCatalogTable',
  component: SportCatalogTable,
  args: { sports, onSelect: () => {} },
} satisfies Meta<typeof SportCatalogTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoSelection: Story = {
  args: { selectedSportId: undefined },
};

export const RowSelected: Story = {
  args: { selectedSportId: 1 },
};

/** The inactive row is the reason this table reads `/sports/all` rather than the
 * public, active-only `/sports`. Status is text, never colour alone. */
export const InactiveSportSelected: Story = {
  args: { selectedSportId: 4 },
};

export const Empty: Story = {
  args: { sports: [], selectedSportId: undefined },
};
