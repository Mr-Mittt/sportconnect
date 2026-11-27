import { describe, expect, it } from 'vitest';
import badminton from './recordSchema/badminton-record-schema-v1.json';
import catalog from './recordSchema/record-ui-v1.json';
import { parseRecordSchema, parseScoreRule, scoreboardTitle, scoreSatisfies, slotTitle } from './recordSchema';

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

describe('the scoreboard block (CLIENT-GL-49)', () => {
  const withBoard = (scoreboard: unknown) => {
    const raw = schema();
    (raw.record as Record<string, unknown>).scoreboard = scoreboard;
    return parseRecordSchema(raw)?.scoreboard;
  };

  it('keeps a history stat of the catalog (sessions, SESSION-82) out of one session\'s scoreboard', () => {
    expect(withBoard({ columns: ['games', 'sessions', 'wins'] })?.columns).toEqual(['games', 'wins']);
    expect(withBoard({ columns: ['sessions'] })?.columns).toEqual(['games', 'wins', 'losses']);
    expect(catalog.COMPETITIVE.scoreboard.columns).toContain('sessions');
    expect(catalog.COMPETITIVE.scoreboard.statIds.sessions).toBe(9);
  });

  it('is the default basic scoreboard when the schema has none', () => {
    expect(parseRecordSchema(schema())?.scoreboard).toEqual({
      enabled: true,
      columns: ['games', 'wins', 'losses'],
      titles: {},
      sort: [
        { by: 'wins', dir: 'DESC' },
        { by: 'winDiff', dir: 'DESC' },
        { by: 'games', dir: 'ASC' },
        { by: 'name', dir: 'ASC' },
      ],
      scoreSlot: null,
    });
  });

  it('reads the columns in the order given, dropping unknown and repeated ones', () => {
    expect(withBoard({ columns: ['winDiff', 'bogus', 'games', 'winDiff', 7] })?.columns).toEqual(['winDiff', 'games']);
  });

  it('falls back to the default columns when none is usable', () => {
    expect(withBoard({ columns: ['bogus'] })?.columns).toEqual(['games', 'wins', 'losses']);
    expect(withBoard({ columns: 'games' })?.columns).toEqual(['games', 'wins', 'losses']);
  });

  it('reads titles per column and language, ignoring blanks and unknown columns', () => {
    const titles = withBoard({
      titles: { wins: { en: 'W', vi: 'T' }, losses: { en: '  ' }, games: { vi: 'Trận' }, bogus: { en: 'x' }, scoreDiff: 'no' },
    })?.titles;
    expect(titles).toEqual({ wins: { en: 'W', vi: 'T' }, games: { en: undefined, vi: 'Trận' } });
  });

  it('reads the sort keys, dropping an unknown key or direction, and falls back to the default order', () => {
    expect(
      withBoard({
        sort: [
          { by: 'scoreDiff', dir: 'DESC' },
          { by: 'bogus', dir: 'ASC' },
          { by: 'wins', dir: 'UP' },
          { by: 'name', dir: 'ASC' },
        ],
      })?.sort,
    ).toEqual([
      { by: 'scoreDiff', dir: 'DESC' },
      { by: 'name', dir: 'ASC' },
    ]);
    expect(withBoard({ sort: [{ by: 'bogus', dir: 'ASC' }] })?.sort[0]).toEqual({ by: 'wins', dir: 'DESC' });
  });

  it('can be switched off, and any other value leaves it on', () => {
    expect(withBoard({ enabled: false })?.enabled).toBe(false);
    expect(withBoard({ enabled: 'no' })?.enabled).toBe(true);
    expect(withBoard('nonsense')?.enabled).toBe(true);
  });

  it('counts one score slot only when scoreSlot names an existing slot', () => {
    const raw = schema({}, { score: { slot: [{ required: true, rule: '>=0' }, { required: false, rule: '>=0' }] } });
    const read = (scoreSlot: unknown) => {
      (raw.record as Record<string, unknown>).scoreboard = { scoreSlot };
      return parseRecordSchema(raw)?.scoreboard.scoreSlot;
    };
    expect(read(1)).toBe(1);
    expect(read(0)).toBe(0);
    expect(read(2)).toBeNull();
    expect(read(-1)).toBeNull();
    expect(read('1')).toBeNull();
    expect(withBoard({ scoreSlot: 0 })?.scoreSlot).toBeNull(); // this schema has no score slot at all
  });

  it('picks a column title: the sport title in the viewer language, else its other language, else the default', () => {
    const board = withBoard({ titles: { wins: { en: 'W' }, losses: { vi: 'T' } } })!;
    expect(scoreboardTitle(board, 'wins', 'en', 'Won')).toBe('W');
    expect(scoreboardTitle(board, 'wins', 'vi', 'Thắng')).toBe('W');
    expect(scoreboardTitle(board, 'losses', 'en', 'Lost')).toBe('T');
    expect(scoreboardTitle(board, 'games', 'vi', 'Trận')).toBe('Trận');
  });
});

describe('the badminton scoreboard (contract, CLIENT-GL-49)', () => {
  it('reads as written: its columns and all four sort keys', () => {
    const parsed = parseRecordSchema(badminton)?.scoreboard;
    expect(parsed?.enabled).toBe(true);
    expect(parsed?.columns).toEqual(['games', 'wins', 'losses', 'winDiff']);
    expect(parsed?.sort).toEqual([
      { by: 'games', dir: 'DESC' },
      { by: 'wins', dir: 'DESC' },
      { by: 'winDiff', dir: 'ASC' },
      { by: 'name', dir: 'ASC' },
    ]);
  });

  it('only uses columns and sort keys the UI catalog offers: a typo would be dropped silently by the parser', () => {
    const raw = (badminton as { record: { scoreboard: { columns: string[]; sort: Array<{ by: string; dir: string }> } } }).record.scoreboard;
    const parsed = parseRecordSchema(badminton)?.scoreboard;
    expect(raw.columns.every((column) => catalog.COMPETITIVE.scoreboard.columns.includes(column))).toBe(true);
    expect(raw.sort.every((entry) => catalog.COMPETITIVE.scoreboard.sortKeys.includes(entry.by))).toBe(true);
    expect(parsed?.columns).toHaveLength(raw.columns.length);
    expect(parsed?.sort).toHaveLength(raw.sort.length); // nothing dropped on the way in
  });
});
