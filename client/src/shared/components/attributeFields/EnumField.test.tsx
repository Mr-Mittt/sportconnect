import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedAttributeLayout, ResolvedSportAttributeOption } from '@/shared/types/sport';
import { EnumField } from './EnumField';
import { resetDevWarnCache } from '@/shared/lib/devWarn';

const threeOptions: ResolvedSportAttributeOption[] = [
  { value: 'attack', label: 'Attack' },
  { value: 'balance', label: 'Balance' },
  { value: 'defend', label: 'Defend' },
];

/** Stateful harness — the arm is controlled, so clearing/toggling needs the value fed back. */
function setup(
  layout?: ResolvedAttributeLayout | null,
  options = threeOptions,
  initial = '',
) {
  const onChange = vi.fn();
  function Harness() {
    const [value, setValue] = useState(initial);
    return (
      <EnumField
        attribute={{ options }}
        fieldId="e"
        label="Playstyle"
        value={value}
        onChange={(v) => {
          onChange(v);
          setValue(v as string);
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

describe('EnumField layout', () => {
  it('renders a select by default', () => {
    setup();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('layout.id "radio" renders one radio per option and selects on click', async () => {
    const { onChange } = setup({ id: 'radio' });
    expect(screen.getByRole('radiogroup', { name: 'Playstyle' })).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Balance'));
    expect(onChange).toHaveBeenLastCalledWith('balance');
  });

  it('layout.id "segmented" renders a segmented radiogroup for a short option list', async () => {
    const { onChange } = setup({ id: 'segmented' });
    await userEvent.click(screen.getByText('Defend'));
    expect(onChange).toHaveBeenLastCalledWith('defend');
  });

  it('layout.id "segmented" with too many options falls back to the select and warns', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ value: `o${i}`, label: `Option ${i}` }));
    setup({ id: 'segmented' }, many);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('unknown layout.id falls back to the select and warns', () => {
    setup({ id: 'chips' });
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(console.warn).toHaveBeenCalledOnce();
  });
});

describe('EnumField — clearable selection (SPORT-13 scope addition)', () => {
  it('dropdown shows no clear button while empty', () => {
    setup({ id: 'dropdown' });
    expect(screen.queryByRole('button', { name: 'Clear Playstyle' })).not.toBeInTheDocument();
  });

  it('dropdown shows a clear button once a value is set, and clicking it clears', async () => {
    const { onChange } = setup({ id: 'dropdown' }, threeOptions, 'balance');
    const clear = screen.getByRole('button', { name: 'Clear Playstyle' });
    await userEvent.click(clear);
    expect(onChange).toHaveBeenLastCalledWith('');
    expect(screen.queryByRole('button', { name: 'Clear Playstyle' })).not.toBeInTheDocument();
  });

  it('radio: clicking the already-selected option deselects it', async () => {
    const { onChange } = setup({ id: 'radio' }, threeOptions, 'attack');
    await userEvent.click(screen.getByLabelText('Attack'));
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('segmented: clicking the already-selected segment deselects it', async () => {
    const { onChange } = setup({ id: 'segmented' }, threeOptions, 'defend');
    await userEvent.click(screen.getByText('Defend'));
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('radio: clicking a different option still just switches (no spurious clear)', async () => {
    const { onChange } = setup({ id: 'radio' }, threeOptions, 'attack');
    await userEvent.click(screen.getByLabelText('Balance'));
    expect(onChange).toHaveBeenLastCalledWith('balance');
  });
});
