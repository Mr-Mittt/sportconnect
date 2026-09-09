import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedAttributeLayout } from '@/shared/types/sport';
import { BooleanField } from './BooleanField';
import { resetDevWarnCache } from '@/shared/lib/devWarn';

/** Stateful harness — the arm is controlled, so a click has to feed the new value back for the
 * next click to register a change. */
function setup(layout?: ResolvedAttributeLayout | null, initial = false) {
  const onChange = vi.fn();
  function Harness() {
    const [value, setValue] = useState<boolean>(initial);
    return (
      <BooleanField
        fieldId="b"
        label="Competitive"
        value={value}
        onChange={(next) => {
          onChange(next);
          setValue(next as boolean);
        }}
        layout={layout}
      />
    );
  }
  render(<Harness />);
  return { onChange };
}

beforeEach(() => {
  resetDevWarnCache();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('BooleanField layout', () => {
  it('renders a switch by default', () => {
    setup();
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('layout.id "checkbox" renders a checkbox that toggles', async () => {
    const { onChange } = setup({ id: 'checkbox' }, false);
    const box = screen.getByRole('checkbox');
    await userEvent.click(box);
    expect(onChange).toHaveBeenLastCalledWith(true);
  });

  it('layout.id "segmented" renders a Yes/No radiogroup that sets a real boolean', async () => {
    const { onChange } = setup({ id: 'segmented' }, false);
    const group = screen.getByRole('radiogroup', { name: 'Competitive' });
    expect(group).toBeInTheDocument();
    await userEvent.click(screen.getByText('Yes'));
    expect(onChange).toHaveBeenLastCalledWith(true);
    await userEvent.click(screen.getByText('No'));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('unknown layout.id falls back to the switch and warns', () => {
    setup({ id: 'toggle-pill' });
    expect(screen.getByRole('switch')).toBeInTheDocument();
    expect(console.warn).toHaveBeenCalledOnce();
  });
});
