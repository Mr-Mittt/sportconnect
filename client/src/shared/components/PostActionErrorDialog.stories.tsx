import { AxiosError, type AxiosResponse } from 'axios';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { PostActionErrorDialog } from './PostActionErrorDialog';

function coded(status: number, errorCode: string): AxiosError {
  const error = new AxiosError('failed', 'ERR_BAD_REQUEST');
  error.response = { status, data: { success: false, message: 'prose', errorCode } } as AxiosResponse;
  return error;
}

const meta = {
  title: 'Shared/PostActionErrorDialog',
  component: PostActionErrorDialog,
  args: { error: coded(404, 'POST_NOT_FOUND'), onDismiss: () => {} },
} satisfies Meta<typeof PostActionErrorDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The post was deleted (or its group is gone). */
export const PostNotFound: Story = {};

/** The post exists but this user may not see it. */
export const PostForbidden: Story = { args: { error: coded(403, 'POST_FORBIDDEN') } };

/** Deleting a post that is not the user's own (and not moderated by them). */
export const DeleteForbidden: Story = { args: { error: coded(403, 'POST_DELETE_FORBIDDEN') } };

/** A server error with no code the client knows: category copy, never server prose. */
export const UnknownCode: Story = { args: { error: coded(403, 'SOMETHING_NEW') } };
