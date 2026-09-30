import type { ClipboardEvent, KeyboardEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { digitsOnlyInputProps, phoneNumberInputProps } from './inputGuards';

function key(k: string, mods: Partial<KeyboardEvent<HTMLInputElement>> = {}) {
  const preventDefault = vi.fn();
  return { event: { key: k, preventDefault, ...mods } as unknown as KeyboardEvent<HTMLInputElement>, preventDefault };
}

function paste(text: string) {
  const preventDefault = vi.fn();
  return {
    event: { clipboardData: { getData: () => text }, preventDefault } as unknown as ClipboardEvent<HTMLInputElement>,
    preventDefault,
  };
}

describe('digitsOnlyInputProps', () => {
  it.each(['e', 'E', '+', '-', '.', 'a'])('blocks the key %s', (k) => {
    const { event, preventDefault } = key(k);
    digitsOnlyInputProps.onKeyDown(event);
    expect(preventDefault).toHaveBeenCalled();
  });

  it.each(['0', '7', 'Backspace', 'Tab', 'ArrowLeft'])('allows the key %s', (k) => {
    const { event, preventDefault } = key(k);
    digitsOnlyInputProps.onKeyDown(event);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('allows shortcuts (Ctrl+V/A) through', () => {
    const { event, preventDefault } = key('v', { ctrlKey: true });
    digitsOnlyInputProps.onKeyDown(event);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('rejects a paste that is not purely digits, allows one that is', () => {
    const bad = paste('1e5');
    digitsOnlyInputProps.onPaste(bad.event);
    expect(bad.preventDefault).toHaveBeenCalled();

    const good = paste('175');
    digitsOnlyInputProps.onPaste(good.event);
    expect(good.preventDefault).not.toHaveBeenCalled();
  });
});

describe('phoneNumberInputProps', () => {
  it.each(['a', 'e', '.', '#', '*'])('blocks the key %s', (k) => {
    const { event, preventDefault } = key(k);
    phoneNumberInputProps.onKeyDown(event);
    expect(preventDefault).toHaveBeenCalled();
  });

  it.each(['0', '+', '-', '(', ')', ' ', 'Backspace'])('allows the key %s', (k) => {
    const { event, preventDefault } = key(k);
    phoneNumberInputProps.onKeyDown(event);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('rejects a paste with letters, allows a formatted number', () => {
    const bad = paste('call me!');
    phoneNumberInputProps.onPaste(bad.event);
    expect(bad.preventDefault).toHaveBeenCalled();

    const good = paste('+84 (90) 123-4567');
    phoneNumberInputProps.onPaste(good.event);
    expect(good.preventDefault).not.toHaveBeenCalled();
  });
});
