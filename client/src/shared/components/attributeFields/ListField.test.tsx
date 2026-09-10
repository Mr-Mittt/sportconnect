import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedAttributeLayout, ResolvedSportAttributeOption } from '@/shared/types/sport';
import { resetDevWarnCache } from '@/shared/lib/devWarn';
import { ListField } from './ListField';

const options: ResolvedSportAttributeOption[] = [
  { value: 'serve', label: 'Serve' },
  { value: 'net', label: 'Net play' },
  { value: 'footwork', label: 'Footwork' },
];

function setup(layout?: ResolvedAttributeLayout | null, initial: string[] = []) {
  const onChange = vi.fn();
  function Harness() {
    const [selected, setSelected] = useState<string[]>(initial);
    return (
      <ListField
        fieldId="l"
        label="Strengths"
        options={options}
        selected={selected}
        onChange={(v) => {
          onChange(v);
          setSelected(v);
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

describe('ListField layout', () => {
  it('checkboxes by default — a checkbox per option, emits a string[]', async () => {
    const { onChange } = setup();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(3);
    await userEvent.click(screen.getByLabelText('Net play'));
    expect(onChange).toHaveBeenLastCalledWith(['net']);
  });

  it('absent layout does not warn', () => {
    setup();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('unknown layout.id falls back to checkboxes and warns once', () => {
    setup({ id: 'grid-9' });
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('chips — toggle buttons with aria-checked, emits a string[]', async () => {
    const { onChange } = setup({ id: 'chips' }, ['serve']);
    const chips = screen.getAllByRole('checkbox');
    expect(chips.every((c) => c.tagName === 'BUTTON')).toBe(true);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Net play' }));
    expect(onChange).toHaveBeenLastCalledWith(['serve', 'net']);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Serve' }));
    expect(onChange).toHaveBeenLastCalledWith(['net']);
  });

  it('multiselect — a native multi-select listbox, emits a string[]', async () => {
    const { onChange } = setup({ id: 'multiselect' });
    const listbox = screen.getByRole('listbox');
    expect(listbox).toHaveAttribute('multiple');
    await userEvent.selectOptions(listbox, 'footwork');
    expect(onChange).toHaveBeenLastCalledWith(['footwork']);
  });

  it('ordered — selected rows reorder within the stored array', async () => {
    const { onChange } = setup({ id: 'ordered' }, ['serve', 'net']);
    await userEvent.click(screen.getByRole('button', { name: 'Move Net play up' }));
    expect(onChange).toHaveBeenLastCalledWith(['net', 'serve']);
  });

  it('ordered — the first selected row cannot move up', () => {
    setup({ id: 'ordered' }, ['serve', 'net']);
    expect(screen.getByRole('button', { name: 'Move Serve up' })).toBeDisabled();
  });
});

describe('ListField cap', () => {
  const many: ResolvedSportAttributeOption[] = Array.from({ length: 12 }, (_u, i) => ({
    value: `t${i}`,
    label: `Tag ${i + 1}`,
  }));
  const tenSelected = Array.from({ length: 10 }, (_u, i) => `t${i}`);

  it('checkboxes disables every unselected option at the cap', () => {
    const onChange = vi.fn();
    render(
      <ListField
        fieldId="l"
        label="Tags"
        options={many}
        selected={tenSelected}
        onChange={onChange}
      />,
    );
    expect(screen.getByText('10 selected (maximum)')).toBeInTheDocument();
    const unchecked = screen
      .getAllByRole('checkbox')
      .filter((c) => !(c as HTMLInputElement).checked);
    expect(unchecked.every((c) => (c as HTMLInputElement).disabled)).toBe(true);
  });

  it('chips disables every unselected pill at the cap', () => {
    render(
      <ListField
        fieldId="l"
        label="Tags"
        options={many}
        selected={tenSelected}
        onChange={vi.fn()}
        layout={{ id: 'chips' }}
      />,
    );
    const unpicked = screen
      .getAllByRole('checkbox')
      .filter((c) => c.getAttribute('aria-checked') === 'false');
    expect(unpicked.every((c) => (c as HTMLButtonElement).disabled)).toBe(true);
  });
});
