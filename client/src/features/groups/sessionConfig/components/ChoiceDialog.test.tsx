import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChoiceDialog, type DialogChoice } from './ChoiceDialog';

function choices(overrides: Partial<Record<string, () => void>> = {}): DialogChoice[] {
  return [
    { key: 'a', label: 'Safe way out', variant: 'outline', onSelect: overrides.a ?? vi.fn() },
    { key: 'b', label: 'Do it', variant: 'primary', onSelect: overrides.b ?? vi.fn() },
  ];
}

describe('ChoiceDialog', () => {
  it('shows the title, the body and one button per choice, in order', () => {
    render(<ChoiceDialog isOpen title="Sure?" body="This changes things." choices={choices()} onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Sure?' })).toBeInTheDocument();
    expect(screen.getByText('This changes things.')).toBeInTheDocument();
    const labels = screen.getAllByRole('button').map((button) => button.textContent);
    expect(labels.indexOf('Safe way out')).toBeLessThan(labels.indexOf('Do it'));
  });

  it('renders nothing while closed', () => {
    render(<ChoiceDialog isOpen={false} title="Sure?" body="Body" choices={choices()} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('a click calls only that choice', async () => {
    const user = userEvent.setup();
    const a = vi.fn();
    const b = vi.fn();
    render(<ChoiceDialog isOpen title="Sure?" body="Body" choices={choices({ a, b })} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Do it' }));
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
  });

  it('Escape calls onClose, once, and no choice', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const b = vi.fn();
    render(<ChoiceDialog isOpen title="Sure?" body="Body" choices={choices({ b })} onClose={onClose} />);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
  });

  it('the close X calls onClose, once, and no choice', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const a = vi.fn();
    const b = vi.fn();
    render(<ChoiceDialog isOpen title="Sure?" body="Body" choices={choices({ a, b })} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it('a disabled choice cannot be clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ChoiceDialog
        isOpen
        title="Sure?"
        body="Body"
        choices={[{ key: 'x', label: 'Wait', variant: 'primary', onSelect, disabled: true }]}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Wait' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Wait' }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows a failure of the chosen action as an alert', () => {
    render(<ChoiceDialog isOpen title="Sure?" body="Body" choices={choices()} onClose={vi.fn()} errorText="That did not work." />);
    expect(screen.getByRole('alert')).toHaveTextContent('That did not work.');
  });

  it('stacks more than two choices (long labels stay readable) and keeps two on one row', () => {
    const three: DialogChoice[] = [
      ...choices(),
      { key: 'c', label: 'Third', variant: 'danger', onSelect: vi.fn() },
    ];
    const { unmount } = render(<ChoiceDialog isOpen title="Sure?" body="Body" choices={three} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Third' }).parentElement).toHaveClass('flex-col');
    unmount();

    render(<ChoiceDialog isOpen title="Sure?" body="Body" choices={choices()} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Do it' }).parentElement).not.toHaveClass('flex-col');
  });
});
