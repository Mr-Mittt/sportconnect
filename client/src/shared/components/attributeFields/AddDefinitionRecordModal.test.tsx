import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ResolvedSportAttributeDefinitionType } from '@/shared/types/sport';
import { AddDefinitionRecordModal } from './AddDefinitionRecordModal';

const RACKET: ResolvedSportAttributeDefinitionType = {
  name: 'Racket',
  fields: [
    { key: 'value', label: 'Model', type: 'STRING', isRequired: true },
    { key: 'gramWeight', label: 'Weight', type: 'NUMBER', isRequired: false },
  ],
};

function Harness({ onSubmit }: { onSubmit: (record: Record<string, unknown>) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <AddDefinitionRecordModal
      open={open}
      onOpenChange={setOpen}
      title="Add — Rackets"
      definitionType={RACKET}
      definitionsByName={new Map([['Racket', RACKET]])}
      onSubmit={(record) => {
        onSubmit(record);
        setOpen(false);
      }}
    />
  );
}

/** Shared "Add" modal (CLIENT-SESSION-17's record-base "Other…" add, extracted for reuse by
 * CLIENT-SESSION-19's `DefinitionListField`). Both callers' own tests cover the modal wired into
 * their real UI; this file covers the modal's own contract in isolation. */
describe('AddDefinitionRecordModal', () => {
  it('renders the title and a DefinitionFields form for the given definition type', () => {
    render(<Harness onSubmit={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Add — Rackets');
    expect(within(dialog).getByLabelText('Model *')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Weight')).toBeInTheDocument();
  });

  it('Add submits the filled record and closes', async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Model *'), 'Astrox 99');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));

    expect(onSubmit).toHaveBeenCalledWith({ value: 'Astrox 99' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Add on an empty draft is a no-op — no submit, modal stays open', async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('Cancel closes without submitting', async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Model *'), 'Astrox 99');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('reopening resets the draft — a prior entry does not leak into the next open', async () => {
    const onSubmit = vi.fn();
    function ReopenHarness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Reopen
          </button>
          <AddDefinitionRecordModal
            open={open}
            onOpenChange={setOpen}
            title="Add — Rackets"
            definitionType={RACKET}
            definitionsByName={new Map([['Racket', RACKET]])}
            onSubmit={onSubmit}
          />
        </>
      );
    }
    render(<ReopenHarness />);
    let dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Model *'), 'Astrox 99');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await userEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Model *')).toHaveValue('');
  });
});
