import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ResolvedAttributeLayout,
  ResolvedSportAttributeDefinitionType,
} from '@/shared/types/sport';
import { resetDevWarnCache } from '@/shared/lib/devWarn';
import { DefinitionListField } from './DefinitionListField';

const scalarRef: ResolvedSportAttributeDefinitionType = {
  name: 'Racket',
  fields: [
    { key: 'value', label: 'Model', type: 'STRING', isRequired: true },
    { key: 'gramWeight', label: 'Weight', type: 'NUMBER', isRequired: false },
  ],
};

const complexRef: ResolvedSportAttributeDefinitionType = {
  name: 'Bag',
  fields: [
    { key: 'value', label: 'Name', type: 'STRING', isRequired: true },
    { key: 'tags', label: 'Tags', type: 'LIST', isRequired: false, options: [] },
  ],
};

function setup(
  layout?: ResolvedAttributeLayout | null,
  initial: Record<string, unknown>[] = [{ value: 'Astrox 99' }, { value: 'Nanoflare' }],
  definitionType = scalarRef,
) {
  const onChange = vi.fn();
  function Harness() {
    const [rows, setRows] = useState(initial);
    return (
      <DefinitionListField
        label="Rackets"
        definitionType={definitionType}
        rows={rows}
        onChange={(next) => {
          onChange(next);
          setRows(next);
        }}
        definitionsByName={new Map([[definitionType.name, definitionType]])}
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

describe('DefinitionListField layout', () => {
  it('cards by default — bordered "Item N" records, remove keeps the row shape', async () => {
    const { onChange } = setup();
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove item 1' }));
    expect(onChange).toHaveBeenLastCalledWith([{ value: 'Nanoflare' }]);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('table — a real table, one row per record, a column per field', () => {
    setup({ id: 'table' });
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Model' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Weight' })).toBeInTheDocument();
    // 2 data rows + 1 header row
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('table — edits write through with the record key shape unchanged', async () => {
    const { onChange } = setup({ id: 'table' }, [{ value: 'Astrox 99' }]);
    const firstRow = screen.getAllByRole('row')[1];
    await userEvent.type(within(firstRow).getByDisplayValue('Astrox 99'), '!');
    expect(onChange).toHaveBeenLastCalledWith([{ value: 'Astrox 99!' }]);
  });

  it('table degrades to cards + warns when a record field is LIST/DEFINITION', () => {
    setup({ id: 'table' }, [{ value: 'Kitbag' }], complexRef);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('accordion — each record a collapsible section, remove keeps the row shape', async () => {
    const { onChange } = setup({ id: 'accordion' });
    expect(screen.getByText('Item 1 · Astrox 99')).toBeInTheDocument();
    expect(screen.getByText('Item 2 · Nanoflare')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove item 2' }));
    expect(onChange).toHaveBeenLastCalledWith([{ value: 'Astrox 99' }]);
  });

  it('unknown layout.id falls back to cards and warns once', () => {
    setup({ id: 'carousel' });
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(console.warn).toHaveBeenCalledOnce();
  });
});

describe('DefinitionListField cap', () => {
  const tenRows = Array.from({ length: 10 }, (_u, i) => ({ value: `R${i}` }));

  it('disables Add at the cap in every layout', () => {
    for (const layout of [undefined, { id: 'table' }, { id: 'accordion' }] as const) {
      const { unmount } = render(
        <DefinitionListField
          label="Rackets"
          definitionType={scalarRef}
          rows={tenRows}
          onChange={vi.fn()}
          definitionsByName={new Map([['Racket', scalarRef]])}
          layout={layout}
        />,
      );
      expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
      expect(screen.getByText('10 items (maximum)')).toBeInTheDocument();
      unmount();
    }
  });
});
