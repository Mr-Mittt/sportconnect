import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { MAX_POST_LENGTH } from '@/features/feed/types';
import { CreatePostForm } from './CreatePostForm';

const currentUser = { firstName: 'Jordan', fullName: 'Jordan Lee', avatarUrl: null };
const noop = () => {};
const baseProps = {
  currentUser,
  onSubmit: noop,
  isSubmitting: false,
  onPhotoClick: noop,
  onLocationClick: noop,
  onTagSportClick: noop,
};

/**
 * `useUnsavedChangesGuard`'s `useBlocker` (PROFILE-10) requires a data router — same two-route
 * memory-router shape `useSettingsUnsavedGuard.test.tsx` (`features/groups/`) established. Returns
 * the router too, so tests that exercise the in-app-navigation leg can drive it directly.
 */
function renderForm(ui: React.ReactElement) {
  const router = createMemoryRouter(
    [
      { path: '/a', element: ui },
      { path: '/b', element: <div>Elsewhere</div> },
    ],
    { initialEntries: ['/a'] },
  );
  const result = render(<RouterProvider router={router} />);
  return { ...result, router };
}

describe('CreatePostForm', () => {
  it("shows the current user's first name in the placeholder", () => {
    renderForm(<CreatePostForm {...baseProps} />);
    expect(screen.getByPlaceholderText("What's on your mind, Jordan?")).toBeInTheDocument();
  });

  it('falls back to a name-less placeholder when currentUser is undefined', () => {
    renderForm(<CreatePostForm {...baseProps} currentUser={undefined} />);
    expect(screen.getByPlaceholderText("What's on your mind?")).toBeInTheDocument();
  });

  it('disables Post until there is text, then enables it', async () => {
    const user = userEvent.setup();
    renderForm(<CreatePostForm {...baseProps} />);
    const postButton = screen.getByRole('button', { name: 'Post' });
    expect(postButton).toBeDisabled();

    await user.type(screen.getByLabelText('Create a post'), 'Great match today!');
    expect(postButton).toBeEnabled();
  });

  it('does not enable Post for whitespace-only input', async () => {
    const user = userEvent.setup();
    renderForm(<CreatePostForm {...baseProps} />);
    await user.type(screen.getByLabelText('Create a post'), '   ');
    expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled();
  });

  it('calls onSubmit with trimmed content, asBroadcast false, and clears the textarea', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    renderForm(<CreatePostForm {...baseProps} onSubmit={onSubmit} />);

    const textarea = screen.getByLabelText('Create a post');
    await user.type(textarea, '  Great match today!  ');
    await user.click(screen.getByRole('button', { name: 'Post' }));

    expect(onSubmit).toHaveBeenCalledWith('Great match today!', { asBroadcast: false });
    expect(textarea).toHaveValue('');
  });

  it('disables Post while a submission is in flight', () => {
    renderForm(<CreatePostForm {...baseProps} isSubmitting />);
    expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled();
  });

  it('enforces MAX_POST_LENGTH via the textarea maxLength attribute', () => {
    renderForm(<CreatePostForm {...baseProps} />);
    expect(screen.getByLabelText('Create a post')).toHaveAttribute(
      'maxLength',
      String(MAX_POST_LENGTH),
    );
  });

  it('reports the inert Photo/Location/Tag sport affordances as clicks, not omitted', async () => {
    const onPhotoClick = vi.fn();
    const onLocationClick = vi.fn();
    const onTagSportClick = vi.fn();
    const user = userEvent.setup();
    renderForm(
      <CreatePostForm
        {...baseProps}
        onPhotoClick={onPhotoClick}
        onLocationClick={onLocationClick}
        onTagSportClick={onTagSportClick}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Photo/ }));
    await user.click(screen.getByRole('button', { name: /Location/ }));
    await user.click(screen.getByRole('button', { name: /Tag sport/ }));

    expect(onPhotoClick).toHaveBeenCalledTimes(1);
    expect(onLocationClick).toHaveBeenCalledTimes(1);
    expect(onTagSportClick).toHaveBeenCalledTimes(1);
  });

  it('does not render the Broadcast toggle when canBroadcast is false (default)', () => {
    renderForm(<CreatePostForm {...baseProps} />);
    expect(screen.queryByRole('button', { name: /Broadcast/ })).not.toBeInTheDocument();
  });

  it('toggling Broadcast on reports asBroadcast: true on submit, then resets', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    renderForm(<CreatePostForm {...baseProps} onSubmit={onSubmit} canBroadcast />);

    const broadcastToggle = screen.getByRole('button', { name: /Broadcast/ });
    expect(broadcastToggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(broadcastToggle);
    expect(broadcastToggle).toHaveAttribute('aria-pressed', 'true');

    await user.type(screen.getByLabelText('Create a post'), 'Court booking confirmed!');
    await user.click(screen.getByRole('button', { name: 'Post' }));

    expect(onSubmit).toHaveBeenCalledWith('Court booking confirmed!', { asBroadcast: true });
    expect(broadcastToggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('hides the error message by default', () => {
    renderForm(<CreatePostForm {...baseProps} />);
    expect(screen.queryByText("Couldn't create post. Try again.")).not.toBeInTheDocument();
  });

  it('shows an error message when isError is true', () => {
    renderForm(<CreatePostForm {...baseProps} isError />);
    expect(screen.getByText("Couldn't create post. Try again.")).toBeInTheDocument();
  });

  describe('unsaved-changes guard (PROFILE-10)', () => {
    it('blocks in-app navigation while there is unsubmitted text, and Leave lets it through', async () => {
      const user = userEvent.setup();
      const { router } = renderForm(<CreatePostForm {...baseProps} />);
      await user.type(screen.getByLabelText('Create a post'), 'Great match today!');

      router.navigate('/b');

      const dialog = await screen.findByRole('dialog', { name: 'Leave without posting?' });
      expect(router.state.location.pathname).toBe('/a');

      await user.click(within(dialog).getByRole('button', { name: 'Leave' }));
      await waitFor(() => expect(router.state.location.pathname).toBe('/b'));
    });

    it('Keep editing cancels the blocked navigation and preserves the text', async () => {
      const user = userEvent.setup();
      const { router } = renderForm(<CreatePostForm {...baseProps} />);
      await user.type(screen.getByLabelText('Create a post'), 'Great match today!');

      router.navigate('/b');
      const dialog = await screen.findByRole('dialog', { name: 'Leave without posting?' });
      await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }));

      expect(router.state.location.pathname).toBe('/a');
      expect(screen.getByLabelText('Create a post')).toHaveValue('Great match today!');
    });

    it('does not block navigation when the composer is empty', async () => {
      const { router } = renderForm(<CreatePostForm {...baseProps} />);

      router.navigate('/b');

      await waitFor(() => expect(router.state.location.pathname).toBe('/b'));
      expect(screen.queryByRole('dialog', { name: 'Leave without posting?' })).not.toBeInTheDocument();
    });
  });
});
