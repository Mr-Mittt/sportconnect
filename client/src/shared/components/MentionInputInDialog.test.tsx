import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';
import { MentionInput } from './MentionInput';

// CLIENT-GL-50: Esc with the `@` list open closes the list, not the dialog the box sits in (Radix reads Escape in the
// capture phase, so the dialog has to leave it to the list).

function renderBox(onOpenChange = vi.fn()) {
  return render(
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Comments</DialogTitle>
        <MentionInput
          ariaLabel="Box"
          placeholder="Type"
          maxLength={100}
          options={[{ id: 'u1', name: 'Priya Shah', label: 'Priya Shah', avatarUrl: null }]}
          pickerLabel="People"
          onChange={() => {}}
          onSubmit={() => {}}
        />
      </DialogContent>
    </Dialog>,
  );
}

describe('MentionInput inside a dialog', () => {
  it('Esc closes the open @ list and keeps the dialog', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderBox(onOpenChange);
    await user.type(screen.getByRole('textbox', { name: 'Box' }), '@Pr');
    expect(screen.getByRole('listbox', { name: 'People' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('Esc with no list open still lets the dialog handle it', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>Comments</DialogTitle>
          <MentionInput
            ariaLabel="Box"
            placeholder="Type"
            maxLength={100}
            options={[]}
            pickerLabel="People"
            onChange={() => {}}
            onSubmit={() => {}}
          />
        </DialogContent>
      </Dialog>,
    );
    await user.type(screen.getByRole('textbox', { name: 'Box' }), 'hello');
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
