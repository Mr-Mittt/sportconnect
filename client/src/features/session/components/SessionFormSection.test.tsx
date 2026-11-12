import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SectionEditActions, SectionSummary, SessionFormSection } from './SessionFormSection';

afterEach(() => {
  // jsdom has no scrollIntoView; tests that need it define it on the prototype.
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

function Harness({ initiallyOpen = false, scroll = true }: { initiallyOpen?: boolean; scroll?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <SessionFormSection title="Where" open={open} onOpenChange={setOpen} scrollIntoViewOnOpen={scroll}>
      <p>section body</p>
    </SessionFormSection>
  );
}

describe('SessionFormSection', () => {
  it('shows its summary while collapsed and its body once open', async () => {
    const user = userEvent.setup();
    function WithSummary() {
      const [open, setOpen] = useState(false);
      return (
        <SessionFormSection
          title="Where"
          open={open}
          onOpenChange={setOpen}
          summary={<SectionSummary items={[{ label: 'Location', value: 'Riverside' }]} />}
        >
          <p>section body</p>
        </SessionFormSection>
      );
    }
    render(<WithSummary />);
    expect(screen.getByText('Location:').parentElement).toHaveTextContent('Location: Riverside');
    expect(screen.queryByText('section body')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Where' }));
    expect(screen.getByText('section body')).toBeInTheDocument();
    // The summary is for the collapsed state only.
    expect(screen.queryByText('Location:')).not.toBeInTheDocument();
  });

  it('renders the amber "Missing: ..." chip with each missing item', () => {
    render(
      <SessionFormSection title="When" open onOpenChange={() => {}} missing={['duration']}>
        x
      </SessionFormSection>,
    );
    expect(screen.getByText('Missing: duration')).toBeInTheDocument();
  });

  it('renders no chip when nothing is missing', () => {
    render(
      <SessionFormSection title="When" open onOpenChange={() => {}}>
        x
      </SessionFormSection>,
    );
    expect(screen.queryByText(/Missing/)).not.toBeInTheDocument();
  });

  it('scrolls itself fully into view (nearest edge) when it opens', async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(<Harness />);
    expect(scrollIntoView).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Where' }));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
  });

  it('does not scroll when it closes, or when scrolling is not asked for', async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { unmount } = render(<Harness initiallyOpen={false} />);
    await user.click(screen.getByRole('button', { name: 'Where' }));
    scrollIntoView.mockClear();
    await user.click(screen.getByRole('button', { name: 'Where' }));
    expect(scrollIntoView).not.toHaveBeenCalled();
    unmount();

    render(<Harness scroll={false} />);
    await user.click(screen.getByRole('button', { name: 'Where' }));
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('does not scroll when it mounts already open, so a form that opens with every section open stays on top', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(
      <>
        <SessionFormSection title="A" open onOpenChange={() => {}} scrollIntoViewOnOpen>
          x
        </SessionFormSection>
        <SessionFormSection title="B" open onOpenChange={() => {}} scrollIntoViewOnOpen>
          x
        </SessionFormSection>
      </>,
    );
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('scrolls on mount only when asked to (the detail modal remounts a section open when its edit starts)', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(
      <SessionFormSection title="A" open onOpenChange={() => {}} scrollIntoViewOnOpen scrollIntoViewOnMount>
        x
      </SessionFormSection>,
    );
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('does not throw where scrollIntoView does not exist', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Where' }));
    expect(screen.getByText('section body')).toBeInTheDocument();
  });
});

describe('SessionFormSection layout', () => {
  it('never shrinks inside a scrolling flex column, so sections scroll instead of overlapping', () => {
    const { container } = render(
      <SessionFormSection title="Where" open onOpenChange={() => {}}>
        x
      </SessionFormSection>,
    );
    expect((container.firstChild as HTMLElement).className).toContain('shrink-0');
  });
});

describe('SessionFormSection border flick', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('flicks the border for one second when the section is un-collapsed, then stops', () => {
    vi.useFakeTimers();
    const { container } = render(<Harness scroll={false} />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).not.toContain('section-flick');
    fireEvent.click(screen.getByRole('button', { name: 'Where' }));
    expect(root.className).toContain('section-flick');
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(root.className).toContain('section-flick');
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(root.className).not.toContain('section-flick');
  });

  it('flicks again each time it is re-opened, and not when it closes', () => {
    vi.useFakeTimers();
    const { container } = render(<Harness scroll={false} />);
    const root = container.firstChild as HTMLElement;
    const toggle = screen.getByRole('button', { name: 'Where' });
    fireEvent.click(toggle);
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    fireEvent.click(toggle); // closes
    expect(root.className).not.toContain('section-flick');
    fireEvent.click(toggle); // opens again
    expect(root.className).toContain('section-flick');
  });

  it('does not flick for a section that is open from the first render (the create form on open)', () => {
    const { container } = render(<Harness initiallyOpen scroll={false} />);
    expect((container.firstChild as HTMLElement).className).not.toContain('section-flick');
  });

  it('flicks for a section that mounts open on purpose (the detail modal when Edit starts)', () => {
    const { container } = render(
      <SessionFormSection title="A" open onOpenChange={() => {}} scrollIntoViewOnMount>
        x
      </SessionFormSection>,
    );
    expect((container.firstChild as HTMLElement).className).toContain('section-flick');
  });
});

describe('SectionSummary', () => {
  it('shows the placeholder when there is no field to list at all, so the row is never blank', () => {
    render(<SectionSummary items={[]} />);
    expect(screen.getByText('...')).toBeInTheDocument();
  });

  it('shows "..." for a missing value (null, undefined or empty), and the value otherwise', () => {
    render(
      <SectionSummary
        items={[
          { label: 'A', value: null },
          { label: 'B', value: undefined },
          { label: 'C', value: '' },
          { label: 'D', value: 'ok' },
        ]}
      />,
    );
    expect(screen.getAllByText('...')).toHaveLength(3);
    expect(screen.getByText('D:').parentElement).toHaveTextContent('D: ok');
  });
});

describe('SectionEditActions', () => {
  const handlers = { onEdit: vi.fn(), onSave: vi.fn(), onDiscard: vi.fn() };
  const base = { ...handlers, canEdit: true, editDisabled: false, isSaving: false, canSave: true };

  it('view mode: an Edit button for someone who can edit, nothing for someone who cannot', () => {
    const { rerender } = render(<SectionEditActions {...base} mode="view" />);
    expect(screen.getByRole('button', { name: 'Edit' })).toBeEnabled();
    rerender(<SectionEditActions {...base} mode="view" canEdit={false} />);
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('view mode: Edit is disabled while another section is being edited', () => {
    render(<SectionEditActions {...base} mode="view" editDisabled />);
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
  });

  it('edit mode: Discard and Save replace Edit, each with an accessible name even when icon-only', () => {
    render(<SectionEditActions {...base} mode="edit" />);
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(handlers.onDiscard).toHaveBeenCalledTimes(1);
    expect(handlers.onSave).toHaveBeenCalledTimes(1);
  });

  it('edit mode: the text label hides below the small breakpoint (icon-only at 375px)', () => {
    render(<SectionEditActions {...base} mode="edit" />);
    const label = screen.getByRole('button', { name: 'Save' }).querySelector('span');
    expect(label?.className).toContain('hidden');
    expect(label?.className).toContain('sm:inline');
  });

  it('edit mode: Save is disabled when nothing can be saved or while saving, and says Saving…', () => {
    const { rerender } = render(<SectionEditActions {...base} mode="edit" canSave={false} />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    rerender(<SectionEditActions {...base} mode="edit" isSaving />);
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeDisabled();
  });
});
