import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from './checkbox';

// This folder is also type-checked by the Keycloak theme's own tsconfig (`client/keycloak-theme/tsconfig.json` includes
// `../src/shared/ui`), which does not load the jest-dom matcher types: so no `toBeChecked` / `toBeDisabled` here, only plain
// DOM state (the same way `dialog.test.tsx` next to it stays within vitest's own matchers).
const isChecked = (box: HTMLElement) => box.getAttribute('aria-checked') === 'true';
const isDisabled = (box: HTMLElement) => (box as HTMLButtonElement).disabled;

describe('Checkbox (CLIENT-SESSION-49)', () => {
  it('is a labelled checkbox that reports its state', () => {
    const { rerender } = render(<Checkbox checked={false} onCheckedChange={() => {}} aria-label="Select Alice" />);
    expect(isChecked(screen.getByRole('checkbox', { name: 'Select Alice' }))).toBe(false);
    rerender(<Checkbox checked onCheckedChange={() => {}} aria-label="Select Alice" />);
    expect(isChecked(screen.getByRole('checkbox', { name: 'Select Alice' }))).toBe(true);
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
    expect(isChecked(screen.getByRole('checkbox', { name: 'Select Alice' }))).toBe(false);
  });

  it('a disabled box ignores clicks and keeps showing its state', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Checkbox checked disabled onCheckedChange={onCheckedChange} aria-label="Select Alice" />);
    const box = screen.getByRole('checkbox', { name: 'Select Alice' });
    expect(isChecked(box)).toBe(true);
    expect(isDisabled(box)).toBe(true);

    await user.click(box);
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
