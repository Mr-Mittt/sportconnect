import { describe, expect, it } from 'vitest';
import type { ResolvedSportAttributeSchema } from '@/shared/types/sport';
import {
  buildSessionAttributePrefill,
  collectSchemaPaths,
  isPrefillValueCompatible,
  pickPaths,
} from './sessionAttributePrefill';

const schema: ResolvedSportAttributeSchema = {
  groups: [
    {
      key: 'match',
      label: 'Match details',
      isAvailable: true,
      attributes: [
        {
          key: 'racketBrand',
          label: 'Racket brand',
          type: 'STRING',
          isAvailable: true,
          prefillable: true,
          prefillKey: 'gear/racketBrand',
        },
        {
          key: 'tension',
          label: 'String tension',
          type: 'NUMBER',
          isAvailable: true,
          prefillable: true,
          prefillKey: 'gear/rackets/tension',
        },
        { key: 'format', label: 'Format', type: 'STRING', isAvailable: true, defaultValue: 'Doubles' },
      ],
      groups: [
        {
          key: 'gear',
          label: 'Gear',
          isAvailable: true,
          attributes: [
            {
              key: 'handedness',
              label: 'Hand',
              type: 'STRING',
              isAvailable: true,
              prefillable: true,
              prefillKey: 'general/handedness',
            },
          ],
        },
      ],
    },
  ],
};

describe('buildSessionAttributePrefill', () => {
  it('seeds a prefillable node from the profile value, keyed by the session node path', () => {
    const seeds = buildSessionAttributePrefill(schema, {
      'gear/racketBrand': 'Yonex',
      'gear/rackets/tension': 27,
      'general/handedness': 'RIGHT',
    });
    expect(seeds).toEqual({
      'match/racketBrand': 'Yonex',
      'match/tension': 27,
      'match/gear/handedness': 'RIGHT',
    });
  });

  it('leaves an "own" (non-prefillable) node alone — SportAttributesFields seeds its defaultValue', () => {
    const seeds = buildSessionAttributePrefill(schema, { 'gear/racketBrand': 'Yonex' });
    expect(seeds).not.toHaveProperty('match/format');
  });

  it('skips a profile value whose type does not match the session node (schema drift)', () => {
    // profile still holds a string under a key the session schema now types as NUMBER
    const seeds = buildSessionAttributePrefill(schema, {
      'gear/racketBrand': 'Yonex',
      'gear/rackets/tension': 'medium',
    });
    expect(seeds).toEqual({ 'match/racketBrand': 'Yonex' });
  });

  it('treats an empty string / null as "no value"', () => {
    const seeds = buildSessionAttributePrefill(schema, {
      'gear/racketBrand': '',
      'gear/rackets/tension': null,
      'general/handedness': 'LEFT',
    });
    expect(seeds).toEqual({ 'match/gear/handedness': 'LEFT' });
  });

  it('returns {} when the caller has no profile for the sport', () => {
    expect(buildSessionAttributePrefill(schema, null)).toEqual({});
  });

  it('skips a node whose availability is off', () => {
    const withHidden: ResolvedSportAttributeSchema = {
      groups: [
        {
          key: 'match',
          label: 'Match',
          isAvailable: true,
          attributes: [
            {
              key: 'racketBrand',
              label: 'Racket brand',
              type: 'STRING',
              isAvailable: false,
              prefillable: true,
              prefillKey: 'gear/racketBrand',
            },
          ],
        },
      ],
    };
    expect(buildSessionAttributePrefill(withHidden, { 'gear/racketBrand': 'Yonex' })).toEqual({});
  });
});

describe('isPrefillValueCompatible', () => {
  it('matches each node kind to its value shape', () => {
    expect(isPrefillValueCompatible('x', 'STRING')).toBe(true);
    expect(isPrefillValueCompatible('x', 'ENUM')).toBe(true);
    expect(isPrefillValueCompatible(3, 'NUMBER')).toBe(true);
    expect(isPrefillValueCompatible(Number.NaN, 'NUMBER')).toBe(false);
    expect(isPrefillValueCompatible(true, 'BOOLEAN')).toBe(true);
    expect(isPrefillValueCompatible(['a'], 'LIST')).toBe(true);
    expect(isPrefillValueCompatible([{ value: 'a' }], 'DEFINITION_LIST')).toBe(true);
    expect(isPrefillValueCompatible({ a: 1 }, 'DEFINITION')).toBe(true);
    expect(isPrefillValueCompatible(['a'], 'DEFINITION')).toBe(false);
    expect(isPrefillValueCompatible('', 'STRING')).toBe(false);
    expect(isPrefillValueCompatible(null, 'STRING')).toBe(false);
    expect(isPrefillValueCompatible(undefined, 'STRING')).toBe(false);
  });
});

describe('collectSchemaPaths / pickPaths', () => {
  it('collects every available attribute path, including nested groups', () => {
    expect(collectSchemaPaths(schema)).toEqual(
      new Set(['match/racketBrand', 'match/tension', 'match/format', 'match/gear/handedness']),
    );
  });

  it('pickPaths keeps only allowed keys', () => {
    const allowed = collectSchemaPaths(schema);
    expect(
      pickPaths({ 'match/format': 'Doubles', 'stale/from-other-sport': 'x' }, allowed),
    ).toEqual({ 'match/format': 'Doubles' });
  });
});
