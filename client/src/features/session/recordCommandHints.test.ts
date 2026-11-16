import { describe, expect, it } from 'vitest';
import badminton from './recordSchema/badminton-record-schema-v1.json';
import { parseRecordSchema, type RecordSchema } from './recordSchema';
import type { Segment } from '@/shared/lib/mentionMarkup';
import { buildCommandHints, coveredHintParts, matchingHints } from './recordCommandHints';

const schema = parseRecordSchema(badminton) as RecordSchema;
const labels = { player: 'player', score: 'score', id: 'id' };
const hints = buildCommandHints(schema, labels);

describe('buildCommandHints', () => {
  it('builds the three templates from the schema', () => {
    expect(hints.map((hint) => hint.template)).toEqual([
      ':add @player1 [@player2] [score] vs [score] @player1 [@player2]',
      ':upd <id> @player1 [@player2] [score] vs [score] @player1 [@player2]',
      ':del <id>',
    ]);
  });

  it('leaves the score out for a sport with no scores', () => {
    const none = parseRecordSchema({
      version: 1,
      record: { data: { type: 'COMPETITIVE', playersPerSide: { min: 2, max: 2 } } },
    }) as RecordSchema;
    expect(buildCommandHints(none, labels)[0].template).toBe(':add @player1 @player2 vs @player1 @player2');
  });
});

describe('matchingHints', () => {
  it('shows nothing unless the text starts with a colon', () => {
    expect(matchingHints('', hints)).toEqual([]);
    expect(matchingHints('hello', hints)).toEqual([]);
    expect(matchingHints('a :add', hints)).toEqual([]);
  });

  it('lists every command for ":" and narrows as the command is typed', () => {
    expect(matchingHints(':', hints).map((h) => h.command)).toEqual(['add', 'upd', 'del']);
    expect(matchingHints(':a', hints).map((h) => h.command)).toEqual(['add']);
    expect(matchingHints(':u', hints).map((h) => h.command)).toEqual(['upd']);
    expect(matchingHints(':add @Bao', hints).map((h) => h.command)).toEqual(['add']);
    expect(matchingHints(':x', hints)).toEqual([]);
  });
});

describe('buildCommandHints parts', () => {
  it('lists the template word by word, joined by a blank it is the template', () => {
    for (const hint of hints) expect(hint.parts.map((part) => part.text).join(' ')).toBe(hint.template);
    expect(hints[0].parts.map((part) => part.role)).toEqual([
      'command',
      'player',
      'player',
      'score',
      'vs',
      'score',
      'player',
      'player',
    ]);
    expect(hints[0].parts.map((part) => part.side)).toEqual([undefined, 0, 0, 0, undefined, 1, 1, 1]);
    expect(hints[1].parts[1]).toEqual({ text: '<id>', role: 'id' });
    expect(hints[2].parts.map((part) => part.role)).toEqual(['command', 'id']);
  });
});

describe('coveredHintParts', () => {
  const chip = (name: string): Segment => ({ kind: 'mention', userId: `id-${name}`, name });
  const text = (value: string): Segment => ({ kind: 'text', text: value });
  const [add, upd, del] = hints;
  /** The covered parts as the words of the hint that are (at least partly) bold. */
  const bold = (hint: (typeof hints)[number], ...draft: Segment[]) =>
    coveredHintParts(hint, draft).flatMap((covered, index) => (covered > 0 ? [hint.parts[index].text.slice(0, covered)] : []));

  it('covers nothing for an empty draft', () => {
    expect(coveredHintParts(add, [])).toEqual(add.parts.map(() => 0));
    expect(bold(add, text(''))).toEqual([]);
  });

  it('covers a typed prefix of the command word, and the whole word once typed', () => {
    expect(bold(add, text(':'))).toEqual([':']);
    expect(bold(add, text(':a'))).toEqual([':a']);
    expect(bold(add, text(':add'))).toEqual([':add']);
    expect(bold(add, text(':add '))).toEqual([':add']);
  });

  it('covers nothing of a hint whose command is another word, and nothing after a command it is not', () => {
    expect(bold(del, text(':add'))).toEqual([]);
    expect(bold(add, text(':added @x'))).toEqual([]);
  });

  it('a picked player covers the first player of its side, the next one the next', () => {
    expect(bold(add, text(':add '), chip('Bao'))).toEqual([':add', '@player1']);
    expect(bold(add, text(':add '), chip('Bao'), text(' '), chip('An'))).toEqual([':add', '@player1', '[@player2]']);
  });

  it('a name typed without being picked covers nothing', () => {
    expect(bold(add, text(':add @Bao'))).toEqual([':add']);
  });

  it('covers the score of the side it is on, then vs, then the right side', () => {
    expect(bold(add, text(':add '), chip('Bao'), text(' 21 vs'))).toEqual([':add', '@player1', '[score]', 'vs']);
    expect(bold(add, text(':add '), chip('Bao'), text(' 21 vs 15 '), chip('An'))).toEqual([
      ':add',
      '@player1',
      '[score]',
      'vs',
      '[score]',
      '@player1',
    ]);
  });

  it('leaves the optional and the missing parts as they are', () => {
    const covered = coveredHintParts(add, [text(':add '), chip('Bao'), text(' vs '), chip('An')]);
    expect(covered).toEqual([4, 8, 0, 0, 2, 0, 8, 0]);
  });

  it('covers the score of a side only for a number, a list of numbers counts too', () => {
    expect(bold(add, text(':add '), chip('Bao'), text(' 3,2 vs'))).toEqual([':add', '@player1', '[score]', 'vs']);
  });

  it('covers the id of :upd and :del, then the record part of :upd', () => {
    expect(bold(upd, text(':upd 12'))).toEqual([':upd', '<id>']);
    expect(bold(upd, text(':upd 12 '), chip('Bao'), text(' vs '), chip('An'))).toEqual([':upd', '<id>', '@player1', 'vs', '@player1']);
    expect(bold(del, text(':del 7'))).toEqual([':del', '<id>']);
    expect(bold(del, text(':del x'))).toEqual([':del']);
  });
});
