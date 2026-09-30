import type { ClipboardEvent, KeyboardEvent } from 'react';

/** Navigation/edit keys a keystroke guard must never block — Tab/Backspace/arrows etc. */
const ALLOWED_CONTROL_KEYS = new Set([
  'Backspace',
  'Delete',
  'Tab',
  'Escape',
  'Enter',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
]);

const DIGIT_CHAR_PATTERN = /^[0-9]$/;
const DIGITS_ONLY_PATTERN = /^[0-9]+$/;
// Digits plus the punctuation a phone number actually uses.
const PHONE_CHAR_PATTERN = /^[0-9+\-() ]$/;
const PHONE_TEXT_PATTERN = /^[0-9+\-() ]+$/;

function blockKey(event: KeyboardEvent<HTMLInputElement>, allowedChar: RegExp) {
  if (event.ctrlKey || event.metaKey || event.altKey || ALLOWED_CONTROL_KEYS.has(event.key)) {
    return;
  }
  if (!allowedChar.test(event.key)) {
    event.preventDefault();
  }
}

function blockPaste(event: ClipboardEvent<HTMLInputElement>, allowedText: RegExp) {
  if (!allowedText.test(event.clipboardData.getData('text'))) {
    event.preventDefault();
  }
}

/**
 * Typing guard for a whole-number field. A native `type="number"` input still accepts
 * `e`/`+`/`-`/`.` from the keyboard (scientific-notation syntax), and never validates a pasted
 * string at all, so `type="number"` alone isn't enough — spread this on the input as well.
 * Purely a client-side typing guard; the server's own bounds validation stays the source of truth.
 */
export const digitsOnlyInputProps = {
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => blockKey(event, DIGIT_CHAR_PATTERN),
  onPaste: (event: ClipboardEvent<HTMLInputElement>) => blockPaste(event, DIGITS_ONLY_PATTERN),
} as const;

/**
 * Typing guard for a phone number field: digits plus `+ - ( )` and space. The server has no phone
 * format validation beyond `@Size(max = 20)`, so this only keeps obviously-wrong input (letters,
 * stray punctuation) out. A `type="tel"` input doesn't validate typed or pasted text on its own.
 */
export const phoneNumberInputProps = {
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => blockKey(event, PHONE_CHAR_PATTERN),
  onPaste: (event: ClipboardEvent<HTMLInputElement>) => blockPaste(event, PHONE_TEXT_PATTERN),
} as const;
