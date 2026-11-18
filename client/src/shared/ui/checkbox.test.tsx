import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from './checkbox';

describe('Checkbox (CLIENT-SESSION-49)', () => {
  it('is a labelled checkbox that reports its state', () => {
    const { rerender } = render(<Checkbox checked={false} onCheckedChange={() => {}} aria-label="Select Alice" />);
    expect(screen.getByRole('checkbox', { name: 'Select Alice' })).not.toBeChecked();
    rerender(<Checkbox checked onCheckedChange={() => {}} aria-label="Select Alice" />);
    expect(screen.getByRole('checkbox', { name: 'Select Alice' })).toBeChecked();
  });

  it('asks for the opposite state on click and on Space', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Checkbox checked={false} onCheckedChange={onCheckedChange} aria-label="Select Alice" />);
    const box = screen.getByRole('checkbox', { name: 'Select Alice' });

    await user.click(box);
    expect(onCheckedChange).toHaveBeenLastCalledWith(true);

    box.focus();
    await user.keyboard(' ');
    expect(onCheckedChange).toHaveBeenCalledTimes(2);
  });

  it('is controlled: it does not change by itself', async () => {
    const user = userEvent.setup();
    render(<Checkbox checked={false} onCheckedChange={() => {}} aria-label="Select Alice" />);
    await user.click(screen.getByRole('checkbox', { name: 'Select Alice' }));
    expect(screen.getByRole('checkbox', { name: 'Select Alice' })).not.toBeChecked();
  });

  it('a disabled box ignores clicks and keeps showing its state', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Checkbox checked disabled onCheckedChange={onCheckedChange} aria-label="Select Alice" />);
    const box = screen.getByRole('checkbox', { name: 'Select Alice' });
    expect(box).toBeChecked();
    expect(box).toBeDisabled();

    await user.click(box);
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
