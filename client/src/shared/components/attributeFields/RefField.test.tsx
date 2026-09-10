import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ResolvedAttributeLayout,
  ResolvedRefAttribute,
  ResolvedSportAttributeDefinitionType,
} from '@/shared/types/sport';
import { resetDevWarnCache } from '@/shared/lib/devWarn';
import { RefField } from './RefField';

const defs = new Map<string, ResolvedSportAttributeDefinitionType>();

function makeNode(
  cardinality: 'SINGLE' | 'LIST',
  layout?: ResolvedAttributeLayout,
): ResolvedRefAttribute {
  return {
    key: 'racket',
    label: 'Racket',
    type: 'STRING',
    prefillable: true,
    cardinality,
    prefillKey: 'gear/racket',
    layout,
  } as ResolvedRefAttribute;
}

function setup(
  node: ResolvedRefAttribute,
  choiceSource: Record<string, unknown> | null,
  initial: unknown,
) {
  const onChange = vi.fn();
  const onAddDraftOption = vi.fn();
  function Harness() {
    const [value, setValue] = useState<unknown>(initial);
    return (
      <RefField
        node={node}
        fieldId="ref"
        value={value}
        onChange={(v) => {
          onChange(v);
          setValue(v);
        }}
        choiceSource={choiceSource}
        draftOptions={[]}
        onAddDraftOption={onAddDraftOption}
        definitionsByName={defs}
      />
    );
  }
  render(<Harness />);
  return { onChange, onAddDraftOption };
}

const THREE = { 'gear/racket': ['Astrox 99', 'Nanoflare 800', 'Thruster K'] };
const SIX = {
  'gear/racket': ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'],
};

beforeEach(() => {
  resetDevWarnCache();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('RefField — SINGLE layout composition', () => {
  it('dropdown by default — a <select> of choices + Other…', () => {
    setup(makeNode('SINGLE'), { 'gear/racket': 'Astrox 99' }, '');
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Other…' })).toBeInTheDocument();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('radio — a radiogroup; picking an option emits the choice value', async () => {
    const { onChange } = setup(makeNode('SINGLE', { id: 'radio' }), THREE, '');
    expect(screen.getByRole('radiogroup', { name: 'Racket' })).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Nanoflare 800'));
    expect(onChange).toHaveBeenLastCalledWith('Nanoflare 800');
  });

  it('segmented — a radiogroup for a short choice list', async () => {
    const { onChange } = setup(makeNode('SINGLE', { id: 'segmented' }), THREE, '');
    await userEvent.click(screen.getByText('Thruster K'));
    expect(onChange).toHaveBeenLastCalledWith('Thruster K');
  });

  it('segmented with > 5 choices → falls back to the <select> and warns once', () => {
    setup(makeNode('SINGLE', { id: 'segmented' }), SIX, '');
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('unknown SINGLE id → dropdown + one warning', () => {
    setup(makeNode('SINGLE', { id: 'stepper' }), THREE, '');
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('Other… still opens the add modal (radio layout)', async () => {
    setup(makeNode('SINGLE', { id: 'radio' }), THREE, '');
    await userEvent.click(screen.getByRole('button', { name: 'Other…' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('RefField — LIST layout composition', () => {
  it('checkboxes by default — a checkbox per choice; toggling emits a string[]', async () => {
    const { onChange } = setup(makeNode('LIST'), THREE, []);
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(3);
    await userEvent.click(screen.getByLabelText('Astrox 99'));
    expect(onChange).toHaveBeenLastCalledWith(['Astrox 99']);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('chips — toggle buttons with aria-checked; toggling emits a string[]', async () => {
    const { onChange } = setup(makeNode('LIST', { id: 'chips' }), THREE, ['Astrox 99']);
    const chips = screen.getAllByRole('checkbox');
    expect(chips.every((c) => c.tagName === 'BUTTON')).toBe(true);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Nanoflare 800' }));
    expect(onChange).toHaveBeenLastCalledWith(['Astrox 99', 'Nanoflare 800']);
  });

  it('multiselect — a native multi-select listbox', async () => {
    const { onChange } = setup(makeNode('LIST', { id: 'multiselect' }), THREE, []);
    const listbox = screen.getByRole('listbox');
    expect(listbox).toHaveAttribute('multiple');
    await userEvent.selectOptions(listbox, ['Thruster K']);
    expect(onChange).toHaveBeenLastCalledWith(['Thruster K']);
  });

  it('ordered — up/down reorders the stored array', async () => {
    const { onChange } = setup(makeNode('LIST', { id: 'ordered' }), THREE, [
      'Astrox 99',
      'Nanoflare 800',
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Move Nanoflare 800 up' }));
    expect(onChange).toHaveBeenLastCalledWith(['Nanoflare 800', 'Astrox 99']);
  });

  it('unknown LIST id → checkboxes + one warning', () => {
    setup(makeNode('LIST', { id: 'grid-9' }), THREE, []);
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('Other… button is present in every LIST layout', () => {
    for (const id of ['checkboxes', 'chips', 'multiselect', 'ordered'] as const) {
      const { unmount } = render(
        <RefField
          node={makeNode('LIST', { id })}
          fieldId="ref"
          value={[]}
          onChange={vi.fn()}
          choiceSource={THREE}
          draftOptions={[]}
          onAddDraftOption={vi.fn()}
          definitionsByName={defs}
        />,
      );
      expect(screen.getByRole('button', { name: 'Other…' })).toBeInTheDocument();
      unmount();
    }
  });
});

// ── SPORT-16 ────────────────────────────────────────────────────────────────────────────────────

describe('RefField — SPORT-16 layout prop (#ref→base inheritance point)', () => {
  it('an explicit layout prop drives the control instead of node.layout', () => {
    render(
      <RefField
        node={makeNode('SINGLE') /* no own layout */}
        fieldId="ref"
        value=""
        onChange={vi.fn()}
        choiceSource={THREE}
        draftOptions={[]}
        onAddDraftOption={vi.fn()}
        definitionsByName={defs}
        layout={{ id: 'radio' }}
      />,
    );
    expect(screen.getByRole('radiogroup', { name: 'Racket' })).toBeInTheDocument();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('layout={null} means "no hint" — the dropdown default, no warning', () => {
    render(
      <RefField
        node={makeNode('SINGLE', { id: 'radio' })}
        fieldId="ref"
        value=""
        onChange={vi.fn()}
        choiceSource={THREE}
        draftOptions={[]}
        onAddDraftOption={vi.fn()}
        definitionsByName={defs}
        layout={null}
      />,
    );
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('an omitted layout prop falls back to node.layout (existing callers unaffected)', () => {
    render(
      <RefField
        node={makeNode('SINGLE', { id: 'radio' })}
        fieldId="ref"
        value=""
        onChange={vi.fn()}
        choiceSource={THREE}
        draftOptions={[]}
        onAddDraftOption={vi.fn()}
        definitionsByName={defs}
      />,
    );
    expect(screen.getByRole('radiogroup', { name: 'Racket' })).toBeInTheDocument();
  });
});

describe('RefField — SPORT-16 #ref fieldLayouts override', () => {
  const grip: ResolvedSportAttributeDefinitionType = {
    name: 'Grip',
    fields: [
      { key: 'brand', label: 'Brand', type: 'STRING', isRequired: true },
      { key: 'note', label: 'Note', type: 'STRING' },
    ],
  };
  const gripDefs = new Map<string, ResolvedSportAttributeDefinitionType>([['Grip', grip]]);

  function recordNode(fieldLayouts?: ResolvedRefAttribute['fieldLayouts']): ResolvedRefAttribute {
    return {
      key: 'grip',
      label: 'Grip',
      type: 'DEFINITION',
      prefillable: true,
      cardinality: 'SINGLE',
      prefillKey: 'gear/grip',
      definitionRef: 'Grip',
      fieldLayouts,
    } as ResolvedRefAttribute;
  }

  async function openOtherModal(node: ResolvedRefAttribute) {
    render(
      <RefField
        node={node}
        fieldId="ref"
        value=""
        onChange={vi.fn()}
        choiceSource={null}
        draftOptions={[]}
        onAddDraftOption={vi.fn()}
        definitionsByName={gripDefs}
        layout={{ id: 'radio' }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Other…' }));
  }

  it('a { hidden: true } override drops that field from the Other… record form', async () => {
    await openOtherModal(recordNode({ note: { hidden: true } }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Brand');
    expect(dialog).not.toHaveTextContent('Note');
  });

  it('no fieldLayouts → every field renders (isRequired still marked)', async () => {
    await openOtherModal(recordNode(undefined));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Brand');
    expect(dialog).toHaveTextContent('Note');
  });

  it('an unknown fieldLayouts key is ignored', async () => {
    await openOtherModal(recordNode({ nope: { hidden: true } }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Brand');
    expect(dialog).toHaveTextContent('Note');
  });
});
