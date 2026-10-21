import { describe, expect, it } from 'vitest';
import { isValidEmail } from './emailFormat';

describe('isValidEmail', () => {
  it.each(['name@example.com', 'first.last+tag@sub.example.co.uk', '  padded@example.com  ', 'a@b.io'])(
    'accepts %j',
    (value) => {
      expect(isValidEmail(value)).toBe(true);
    },
  );

  it.each(['', '   ', 'plain', 'no-at.example.com', '@example.com', 'name@', 'name@example', 'name@.com', 'name@example.c', 'na me@example.com', 'a@@b.com', 'a@b@c.com'])(
    'refuses %j',
    (value) => {
      expect(isValidEmail(value)).toBe(false);
    },
  );
});
