import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import en from './en';
import { STOCK_KEYS_USED_BY_PAGES } from './stockKeys';
import vi from '../messages_vi';

describe('theme messages', () => {
  it('every theme-defined English key has a Vietnamese one', () => {
    const missing = Object.keys(en).filter((key) => !(key in vi));
    expect(missing).toEqual([]);
  });

  it('every Keycloak key a themed page renders has a Vietnamese one', () => {
    const missing = STOCK_KEYS_USED_BY_PAGES.filter((key) => !(key in vi));
    expect(missing).toEqual([]);
  });

  it('has no empty Vietnamese string, apart from the deliberately empty terms text', () => {
    const empty = Object.entries(vi)
      .filter(([key, value]) => value.trim() === '' && key !== 'termsText')
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it('has no apostrophe (Keycloak runs messages through MessageFormat)', () => {
    const withApostrophe = Object.entries({ ...en, ...vi })
      .filter(([, value]) => value.includes("'"))
      .map(([key]) => key);
    expect(withApostrophe).toEqual([]);
  });

  // keycloakify build reads this literal with eval, in isolation (no imports, no spreads): if it
  // stops being plain data, messages_vi.properties is silently not generated and Keycloak's own
  // server-side messages (wrong password, field errors) come out in English.
  it('keeps the server-side Vietnamese messages a statically evaluable literal', () => {
    const source = readFileSync(new URL('../messages_vi.ts', import.meta.url), 'utf8');
    const literal = source.slice(source.indexOf('const messages = {'), source.indexOf('const themeKeys'));
    expect(literal).not.toMatch(/\.\.\.|viLogin|import\(/);
    const initializer = literal.replace('const messages = ', '').replace(/;\s*$/, '');
    const evaluated = new Function(`return (${initializer})`)() as Record<string, string>;
    expect(evaluated.invalidUserMessage).toBe('Email hoặc mật khẩu không đúng.');
  });
});
