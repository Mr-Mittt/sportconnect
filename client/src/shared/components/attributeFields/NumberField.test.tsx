import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedAttributeLayout } from '@/shared/types/sport';
import { NumberField } from './NumberField';
import { resetDevWarnCache } from '@/shared/lib/devWarn';

function setup(opts: {
  layout?: ResolvedAttributeLayout | null;
  value?: number;
  min?: number | null;
  max?: number | null;
} = {}) {
  const onChange = vi.fn();
  render(
    <NumberField
      attribute={{ min: opts.min ?? null, max: opts.max ?? null }}
      fieldId="n"
      label="Tension"
      value={opts.value ?? 20}
      onChange={onChange}
      layout={opts.layout}
    />,
  );
  return { onChange };
}

beforeEach(() => {
  resetDevWarnCache();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('NumberField layout', () => {
  it('renders a number input by default', () => {
    setup();
    expect(screen.getByRole('spinbutton')).toHaveValue(20);
  });

  it('layout.id "stepper" adds decrease/increase buttons that change the value', async () => {
    const { onChange } = setup({ layout: { id: 'stepper' }, value: 20 });
    await userEvent.click(screen.getByRole('button', { name: 'Increase Tension' }));
    expect(onChange).toHaveBeenLastCalledWith(21);
    await userEvent.click(screen.getByRole('button', { name: 'Decrease Tension' }));
    expect(onChange).toHaveBeenLastCalledWith(19);
  });

  it('layout.id "slider" renders a range input when min/max are set', () => {
    setup({ layout: { id: 'slider' }, min: 15, max: 35, value: 25 });
    expect(screen.getByRole('slider')).toHaveValue('25');
  });

  it('layout.id "slider" without bounds falls back to the number input and warns', () => {
    setup({ layout: { id: 'slider' } });
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    expect(screen.getByRole('spinbutton')).toBeInTheDocument();
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('layout.id "readonly-text" renders the value as text with format applied', () => {
    setup({ layout: { id: 'readonly-text', format: '0.0 lbs' }, value: 24 });
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.getByText('24.0 lbs')).toBeInTheDocument();
  });

  it('format shows a preview line under the editable input', () => {
    setup({ layout: { id: 'input', format: '#,##0' }, value: 1234 });
    expect(screen.getByRole('spinbutton')).toHaveValue(1234);
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  it('the number input still reports undefined when cleared, across layouts', async () => {
    const { onChange } = setup({ layout: { id: 'stepper' }, value: 5 });
    await userEvent.clear(screen.getByRole('spinbutton'));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('unknown layout.id falls back to the number input and warns', () => {
    setup({ layout: { id: 'dial' } });
    expect(screen.getByRole('spinbutton')).toBeInTheDocument();
    expect(console.warn).toHaveBeenCalledOnce();
  });
});
