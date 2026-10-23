import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Vitest runs with the client folder as the working directory.
const served = readFileSync(resolve('public/earth.png'));
const reference = readFileSync(resolve('design-reference/earth.png'));

describe('the globe image of the auth illustration (AUTH-17)', () => {
  it('is a PNG with an alpha channel, drawn at twice the 304 px it is shown at', () => {
    expect(served.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect(served.readUInt32BE(16)).toBe(640);
    expect(served.readUInt32BE(20)).toBe(640);
    // colour type 6 = RGBA: a real transparent sea, not a baked-in checkerboard
    expect(served[25]).toBe(6);
  });

  it('stays small: the slot is 304 px, so a multi-hundred-KB file is a regression', () => {
    expect(served.length).toBeLessThan(150 * 1024);
  });

  it('carries no stock-site mark in its bytes (text chunks) and is the same file as the design reference copy', () => {
    expect(served.toString('latin1')).not.toMatch(/vecteezy/i);
    expect(served.equals(reference)).toBe(true);
  });
});
