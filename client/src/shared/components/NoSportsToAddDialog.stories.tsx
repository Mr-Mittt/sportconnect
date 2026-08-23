import type { Meta, StoryObj } from '@storybook/react-vite';
import { NoSportsToAddDialog } from './NoSportsToAddDialog';

/**
 * SPORT-5. Both stories render open — the dialog only exists in its open state, and a
 * closed story would show an empty canvas.
 */
const meta = {
  title: 'Shared/NoSportsToAddDialog',
  component: NoSportsToAddDialog,
  parameters: { layout: 'centered' },
  args: {
    isOpen: true,
    onClose: () => {},
    onRetry: () => {},
    isRetrying: false,
  },
} satisfies Meta<typeof NoSportsToAddDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The user genuinely holds every sport the catalogue offers — a final answer. */
export const EverythingHeld: Story = {
  args: { isCatalogUnavailable: false },
};

/**
 * The catalogue could not be re-read and nothing was cached, so completeness is unknown.
 * Deliberately different copy: "you have every sport" here would be false, not stale.
 */
export const CatalogUnavailable: Story = {
  args: { isCatalogUnavailable: true },
};

/** Mid-retry — the action is disabled so a second read can't be queued behind the first. */
export const Retrying: Story = {
  args: { isCatalogUnavailable: true, isRetrying: true },
};
