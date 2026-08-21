import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AdminUnsavedChangesDialog } from './AdminUnsavedChangesDialog';

describe('AdminUnsavedChangesDialog (ADMIN-4)', () => {
  it('renders nothing while closed', () => {
    render(
      <AdminUnsavedChangesDialog isOpen={false} onCancel={vi.fn()} onDiscard={vi.fn()} />,
    );

    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });

  it('offers discard and cancel, and no save', () => {
    render(<AdminUnsavedChangesDialog isOpen onCancel={vi.fn()} onDiscard={vi.fn()} />);

    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard & log out' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    // Deliberately absent — two forms with separate endpoints can be dirty at once,
    // so a single Save has no unambiguous meaning here (see the component's doc).
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
  });

  it('calls onDiscard when the admin confirms', async () => {
    const user = userEvent.setup();
    const onDiscard = vi.fn();
    render(<AdminUnsavedChangesDialog isOpen onCancel={vi.fn()} onDiscard={onDiscard} />);

    await user.click(screen.getByRole('button', { name: 'Discard & log out' }));

    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel from the Cancel button', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<AdminUnsavedChangesDialog isOpen onCancel={onCancel} onDiscard={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('treats dismissing the dialog as a cancel, not a discard', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onDiscard = vi.fn();
    render(<AdminUnsavedChangesDialog isOpen onCancel={onCancel} onDiscard={onDiscard} />);

    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDiscard).not.toHaveBeenCalled();
  });
});
