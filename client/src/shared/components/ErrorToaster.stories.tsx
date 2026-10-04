import type { Meta, StoryObj } from '@storybook/react-vite';
import { AxiosError, type AxiosResponse } from 'axios';
import { showErrorToast } from '@/shared/lib/errorToast';
import { Button } from '@/shared/ui/button';
import { ErrorToaster } from './ErrorToaster';

function failure(status: number | null): AxiosError {
  const error = new AxiosError(status === null ? 'Network Error' : 'failed', status === null ? 'ERR_NETWORK' : 'ERR_BAD_REQUEST');
  if (status !== null) error.response = { status, data: { message: 'server text' } } as AxiosResponse;
  return error;
}

/**
 * CLIENT-ERR-1: the global mutation-failure toast. The buttons fire the same `showErrorToast` the
 * `MutationCache` handler calls; switch the toolbar locale to review the Vietnamese copy.
 */
const meta = {
  title: 'Shared/ErrorToaster',
  component: ErrorToaster,
  render: () => (
    <div className="flex flex-wrap gap-2 p-4">
      <ErrorToaster />
      <Button onClick={() => showErrorToast(failure(500))}>Server error</Button>
      <Button onClick={() => showErrorToast(failure(403))}>Forbidden</Button>
      <Button onClick={() => showErrorToast(failure(404))}>Not found</Button>
      <Button onClick={() => showErrorToast(failure(409))}>Conflict (server text)</Button>
      <Button onClick={() => showErrorToast(failure(null))}>Offline</Button>
    </div>
  ),
} satisfies Meta<typeof ErrorToaster>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
