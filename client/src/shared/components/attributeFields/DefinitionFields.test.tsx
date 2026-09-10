import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ResolvedAttributeLayout,
  ResolvedSportAttributeDefinitionType,
} from '@/shared/types/sport';
import { resetDevWarnCache } from '@/shared/lib/devWarn';
import { DefinitionFields } from './DefinitionFields';

const reference: ResolvedSportAttributeDefinitionType = {
  name: 'Reference',
  fields: [
    { key: 'value', label: 'Name', type: 'STRING', isRequired: true },
    { key: 'gramWeight', label: 'Weight (g)', type: 'NUMBER', isRequired: false, min: 0, max: 500 },
    { key: 'inStock', label: 'In stock', type: 'BOOLEAN', isRequired: false },
  ],
};

function setup(layout?: ResolvedAttributeLayout | null, initial: Record<string, unknown> = {}) {
  const onChange = vi.fn();
  function Harness() {
    const [record, setRecord] = useState(initial);
    return (
      <DefinitionFields
        definitionType={reference}
        record={record}
        onChange={(next) => {
          onChange(next);
          setRecord(next);
        }}
        definitionsByName={new Map([['Reference', reference]])}
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

describe('DefinitionFields layout', () => {
  it('stacked by default — a control per field, bare record keys on change', async () => {
    const { onChange } = setup();
    await userEvent.type(screen.getByLabelText('Name *'), 'Astrox');
    expect(onChange).toHaveBeenLastCalledWith({ value: 'Astrox' });
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('grid-2 renders every field and keeps the record key shape', async () => {
    const { onChange } = setup({ id: 'grid-2' });
    expect(screen.getByLabelText('Name *')).toBeInTheDocument();
    expect(screen.getByLabelText('Weight (g)')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Name *'), 'X');
    expect(onChange).toHaveBeenLastCalledWith({ value: 'X' });
  });

  it('inline renders every field and keeps the record key shape', async () => {
    const { onChange } = setup({ id: 'inline' });
    expect(screen.getByLabelText('Name *')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Name *'), 'Y');
    expect(onChange).toHaveBeenLastCalledWith({ value: 'Y' });
  });

  it('unknown layout.id falls back to stacked and warns once', () => {
    setup({ id: 'masonry' });
    expect(screen.getByLabelText('Name *')).toBeInTheDocument();
    expect(console.warn).toHaveBeenCalledOnce();
  });
});
