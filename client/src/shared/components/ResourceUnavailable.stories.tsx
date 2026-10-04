import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { ResourceUnavailable } from './ResourceUnavailable';

/**
 * CLIENT-ERR-1: the shared "can't show this" state. One story per variant; switch the toolbar
 * locale to review the Vietnamese copy.
 */
const meta = {
  title: 'Shared/ResourceUnavailable',
  component: ResourceUnavailable,
  args: { onAction: fn() },
} satisfies Meta<typeof ResourceUnavailable>;

export default meta;
type Story = StoryObj<typeof meta>;

/** An unknown route (the router's catch-all). */
export const NotFound: Story = { args: { variant: 'notFound', headingAs: 'h1' } };

/** A resource the caller may not see (403). */
export const Forbidden: Story = { args: { variant: 'forbidden' } };

/** A deleted or unavailable resource (404 on a page query). */
export const Unavailable: Story = { args: { variant: 'unavailable' } };

/** A page query that failed with a server error (5xx). */
export const LoadError: Story = { args: { variant: 'error' } };

/** No response at all: offline, or the server is unreachable. */
export const Offline: Story = { args: { variant: 'network' } };

/** A render crash caught by the router's `errorElement`. */
export const Crash: Story = { args: { variant: 'crash', headingAs: 'h1' } };

/** No action: the state is informational (e.g. an inline section the user cannot act on). */
export const WithoutAction: Story = { args: { variant: 'unavailable', onAction: undefined } };
