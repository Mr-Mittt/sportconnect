import { describe, expect, it } from 'vitest';
import badminton from './recordSchema/badminton-record-schema-v1.json';
import catalog from './recordSchema/record-ui-v1.json';
import { parseRecordSchema, parseScoreRule, scoreSatisfies, slotTitle } from './recordSchema';

function schema(overrides: Record<string, unknown> = {}, data: Record<string, unknown> = {}, ui?: unknown) {
  return {
    version: 1,
    maxRecords: 50,
    record: {
      data: { type: 'COMPETITIVE', playersPerSide: { min: 1, max: 2 }, ...data },
      UI: ui ?? { id: 'horizontal', config: { winnerAlign: 'LEFT' } },
    },
    ...overrides,
  };
}

describe('the committed badminton schema (contract)', () => {
  it('parses: 1 to 2 players a side, one required Point slot above zero, 50 records, winner on the left', () => {
    const parsed = parseRecordSchema(badminton);
    expect(parsed).not.toBeNull();
    expect(parsed?.maxRecords).toBe(50);
    expect(parsed?.playersPerSide).toEqual({ min: 1, max: 2 });
    expect(parsed?.slots).toHaveLength(1);
    expect(parsed?.slots[0].required).toBe(true);
    expect(parsed?.slots[0].title).toEqual({ vi: 'Điểm', en: 'Point' });
    expect(parsed?.slots[0].rule).toEqual([{ op: '>', value: 0 }]);
    expect(parsed?.ui).toEqual({ id: 'horizontal', winnerAlign: 'LEFT', winnerTone: 'success', loserTone: 'warning' });
  });

  it('only uses styles, aligns and tones the UI catalog offers', () => {
    const parsed = parseRecordSchema(badminton);
    expect(Object.keys(catalog.COMPETITIVE.styles)).toContain(parsed?.ui.id);
    expect(catalog.COMPETITIVE.styles.horizontal.config.winnerAlign.enum).toContain(parsed?.ui.winnerAlign);
    expect(catalog.tones).toEqual(expect.arrayContaining([parsed?.ui.winnerTone, parsed?.ui.loserTone]));
  });
});

describe('parseRecordSchema', () => {
  it('is null for nothing, a wrong version, or another record type', () => {
    expect(parseRecordSchema(null)).toBeNull();
    expect(parseRecordSchema({})).toBeNull();
    expect(parseRecordSchema(schema({ version: 2 }))).toBeNull();
    expect(parseRecordSchema(schema({ version: undefined }))).toBeNull();
    expect(parseRecordSchema(schema({}, { type: 'PERSONAL' }))).toBeNull();
  });

  it('is null for a malformed playersPerSide or score slots', () => {
    expect(parseRecordSchema(schema({}, { playersPerSide: { min: 0, max: 2 } }))).toBeNull();
    expect(parseRecordSchema(schema({}, { playersPerSide: { min: 3, max: 2 } }))).toBeNull();
    expect(parseRecordSchema(schema({}, { playersPerSide: { min: 1, max: 99 } }))).toBeNull();
    expect(parseRecordSchema(schema({}, { playersPerSide: 'two' }))).toBeNull();
    expect(parseRecordSchema(schema({}, { score: { slot: 'one' } }))).toBeNull();
    expect(parseRecordSchema(schema({}, { score: { slot: [1, 2] } }))).toBeNull();
  });

  it('reads no score block as no scores', () => {
    expect(parseRecordSchema(schema())?.slots).toEqual([]);
  });

  it('defaults maxRecords to 100 and clamps it to 500 like the server', () => {
    expect(parseRecordSchema(schema({ maxRecords: undefined }))?.maxRecords).toBe(100);
    expect(parseRecordSchema(schema({ maxRecords: 9999 }))?.maxRecords).toBe(500);
    expect(parseRecordSchema(schema({ maxRecords: 0 }))?.maxRecords).toBe(1);
  });

  it('falls back to the catalog default for an unknown style, align or tone', () => {
    const parsed = parseRecordSchema(
      schema({}, {}, { id: 'carousel', config: { winnerAlign: 'MIDDLE', winnerTone: 'purple' } }),
    );
    expect(parsed?.ui).toEqual({ id: 'horizontal', winnerAlign: 'LEFT', winnerTone: 'success', loserTone: 'warning' });
  });

  it('keeps an align only for the style it belongs to', () => {
    const vertical = parseRecordSchema(schema({}, {}, { id: 'vertical', config: { winnerAlign: 'BOTTOM', loserTone: 'danger' } }));
    expect(vertical?.ui).toMatchObject({ id: 'vertical', winnerAlign: 'BOTTOM', loserTone: 'danger' });
    const wrong = parseRecordSchema(schema({}, {}, { id: 'vertical', config: { winnerAlign: 'LEFT' } }));
    expect(wrong?.ui.winnerAlign).toBe('TOP');
  });
});

describe('score rules', () => {
  it.each([
    ['>0', [{ op: '>', value: 0 }]],
    ['>=0', [{ op: '>=', value: 0 }]],
    [' >= 0 & <= 30 ', [{ op: '>=', value: 0 }, { op: '<=', value: 30 }]],
  ])('parses %s', (text, expected) => {
    expect(parseScoreRule(text)).toEqual(expected);
  });

  it.each(['', 'positive', '>', '>0&', '=5', '>0;<5', undefined, 7])('treats %s as no rule', (text) => {
    expect(parseScoreRule(text)).toEqual([]);
  });

  it('checks every comparison, integers only', () => {
    const rule = parseScoreRule('>=0&<=30');
    expect(scoreSatisfies(rule, 0)).toBe(true);
    expect(scoreSatisfies(rule, 30)).toBe(true);
    expect(scoreSatisfies(rule, 31)).toBe(false);
    expect(scoreSatisfies(rule, -1)).toBe(false);
    expect(scoreSatisfies(rule, 2.5)).toBe(false);
    expect(scoreSatisfies(parseScoreRule('>0'), 0)).toBe(false);
    expect(scoreSatisfies([], 12)).toBe(true);
  });
});

describe('slotTitle', () => {
  const slot = { required: true, title: { en: 'Point', vi: 'Điểm' }, rule: [] };
  it('uses the viewer language, then the other one, then #n', () => {
    expect(slotTitle(slot, 0, 'vi')).toBe('Điểm');
    expect(slotTitle({ ...slot, title: { en: 'Point' } }, 0, 'vi')).toBe('Point');
    expect(slotTitle({ ...slot, title: {} }, 1, 'en')).toBe('#2');
  });
});
