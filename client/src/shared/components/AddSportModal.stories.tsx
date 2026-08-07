import type { Meta, StoryObj } from '@storybook/react-vite';
import { AddSportModal } from './AddSportModal';

const meta = {
  title: 'Shared/AddSportModal',
  component: AddSportModal,
  args: {
    isOpen: true,
    onClose: () => {},
    availableSports: ['basketball', 'tennis'],
    onSubmit: () => {},
    isSubmitting: false,
    isError: false,
  },
} satisfies Meta<typeof AddSportModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Two sports left to add (one already has a profile). */
export const Default: Story = {};

/** Only one sport left — still a picker, just one option. */
export const OneSportLeft: Story = {
  args: { availableSports: ['tennis'] },
};

/** Safety-net state — SportSwitcher's own aria-disabled cap should prevent
 * this from being reachable, but the modal still renders sensibly if it is. */
export const NoSportsLeft: Story = {
  args: { availableSports: [] },
};

export const Submitting: Story = {
  args: { isSubmitting: true },
};

export const ErrorState: Story = {
  args: { isError: true },
};

/** CLIENT-SESSION-7 follow-up: auto-opened by the zero-sport-profile page-access gate on
 * Groups/Matches, rather than the SportSwitcher "+" pill — carries the funny prompt. */
export const AutoPromptedOnPageAccess: Story = {
  args: {
    promptMessage: "Hey champ, add a sport first — this page won't make much sense without one! 🏅",
  },
};
