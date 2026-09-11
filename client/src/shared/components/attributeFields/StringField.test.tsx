import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedAttributeLayout } from '@/shared/types/sport';
import { StringField } from './StringField';
import { resetDevWarnCache } from '@/shared/lib/devWarn';

function setup(layout?: ResolvedAttributeLayout | null, value = 'hello') {
  const onChange = vi.fn();
  render(
    <StringField fieldId="f" label="Note" value={value} onChange={onChange} layout={layout} />,
  );
  return { onChange };
}

beforeEach(() => {
  resetDevWarnCache();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('StringField layout', () => {
  it('renders a text input by default (no layout)', () => {
    setup();
    expect(screen.getByRole('textbox')).toHaveValue('hello');
  });

  it('layout.id "input" is the same text input', () => {
    setup({ id: 'input' });
    expect(screen.getByRole('textbox').tagName).toBe('INPUT');
  });

  it('layout.id "textarea" renders a textarea, still editable', async () => {
    const { onChange } = setup({ id: 'textarea' }, '');
    const box = screen.getByRole('textbox');
    expect(box.tagName).toBe('TEXTAREA');
    await userEvent.type(box, 'x');
    expect(onChange).toHaveBeenLastCalledWith('x');
  });

  it('layout.id "readonly-text" renders the value as text, not an input', () => {
    setup({ id: 'readonly-text' }, 'yonex');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('yonex')).toBeInTheDocument();
  });

  it('readonly-text applies layout.format', () => {
    setup({ id: 'readonly-text', format: { en: 'uppercase' } }, 'yonex');
    expect(screen.getByText('YONEX')).toBeInTheDocument();
  });

  it('unknown layout.id falls back to the input and warns', () => {
    setup({ id: 'carousel' });
    expect(screen.getByRole('textbox').tagName).toBe('INPUT');
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('a malformed layout (no id) falls back to the input and warns', () => {
    setup({ format: { en: 'uppercase' } } as unknown as ResolvedAttributeLayout);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('a non-object layout falls back and warns', () => {
    setup('textarea' as unknown as ResolvedAttributeLayout);
    expect(screen.getByRole('textbox').tagName).toBe('INPUT');
    expect(console.warn).toHaveBeenCalledOnce();
  });
});
