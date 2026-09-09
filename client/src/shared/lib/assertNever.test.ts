import { describe, expect, it } from 'vitest';
import { assertNever } from './assertNever';

describe('assertNever', () => {
  it('throws when reached at runtime (a value the type system said was impossible)', () => {
    // Callers pass `never`; cast here to simulate a wire value outside the union slipping through.
    expect(() => assertNever('UNEXPECTED' as never)).toThrow(/Unhandled discriminated union member/);
  });
});
