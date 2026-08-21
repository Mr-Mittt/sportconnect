import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SportResponse } from '@/shared/types/sport';
import { SportFieldsForm } from './SportFieldsForm';

const badminton: SportResponse = {
  id: 1,
  name: 'Badminton',
  description: 'Racket sport played over a net.',
  category: 'Racket',
  iconUrl: '/images/sports/badminton.png',
  minPlayers: 2,
  maxPlayers: 4,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const meta = {
  title: 'Admin/SportFieldsForm',
  component: SportFieldsForm,
  args: {
    sport: badminton,
    onSave: () => {},
    isSaving: false,
    errorMessage: null,
    isSaved: false,
  },
  decorators: [
    (Story) => (
      <div className="max-w-md rounded-xl border-hairline border-border bg-surface-2 p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SportFieldsForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Pristine — Save and Reset are both disabled until something actually changes,
 * since the payload is a diff and an empty one would be a no-op request. */
export const Pristine: Story = {};

export const Saving: Story = {
  args: { isSaving: true },
};

export const Saved: Story = {
  args: { isSaved: true },
};

export const ServerRejected: Story = {
  args: { errorMessage: 'Sport name must be between 2 and 100 characters' },
};

/** The generic copy shown for a duplicate-name rename, which the backend currently
 * surfaces as an opaque 500 rather than a readable 400 (see the ADMIN-2 doc). */
export const UnexpectedServerError: Story = {
  args: { errorMessage: 'Could not save the sport. Please try again.' },
};

/** A deactivated sport is still fully editable here — `PUT /api/sports/{id}` resolves
 * via `findById`, unlike the attribute-schema GET. This is how a sport gets activated. */
export const InactiveSport: Story = {
  args: { sport: { ...badminton, id: 4, name: 'Tennis', isActive: false } },
};
