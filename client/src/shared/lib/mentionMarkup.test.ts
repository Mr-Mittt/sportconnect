import { describe, expect, it } from 'vitest';
import {
  cleanName,
  clipSegments,
  isEmptyDraft,
  parseMarkup,
  plainText,
  serialize,
  storedLength,
  trimSegments,
  type Segment,
} from './mentionMarkup';

// CLIENT-GL-50: tags in a comment are stored as `@[Full Name](userId)`.

const ID = '123e4567-e89b-12d3-a456-426614174000';
const ID2 = '223e4567-e89b-12d3-a456-426614174001';

describe('parseMarkup', () => {
  it('reads text and tags', () => {
    expect(parseMarkup(`hi @[Priya Shah](${ID}) see you`)).toEqual([
      { kind: 'text', text: 'hi ' },
      { kind: 'mention', userId: ID, name: 'Priya Shah' },
      { kind: 'text', text: ' see you' },
    ]);
  });

  it('reads several tags, including two in a row', () => {
    expect(parseMarkup(`@[A](${ID})@[B](${ID2})`)).toEqual([
      { kind: 'mention', userId: ID, name: 'A' },
      { kind: 'mention', userId: ID2, name: 'B' },
    ]);
  });

  it('leaves markup it cannot read as plain text', () => {
    expect(parseMarkup('@[Bao](broken')).toEqual([{ kind: 'text', text: '@[Bao](broken' }]);
    expect(parseMarkup('@[Bao](two words)')).toEqual([{ kind: 'text', text: '@[Bao](two words)' }]);
    expect(parseMarkup(`@[Bao(${ID})`)).toEqual([{ kind: 'text', text: `@[Bao(${ID})` }]);
    expect(parseMarkup(`@[](${ID})`)).toEqual([{ kind: 'text', text: `@[](${ID})` }]);
    expect(parseMarkup('plain @Bao')).toEqual([{ kind: 'text', text: 'plain @Bao' }]);
  });

  it('keeps the name that was stored', () => {
    expect(parseMarkup(`@[Old Name](${ID})`)).toEqual([{ kind: 'mention', userId: ID, name: 'Old Name' }]);
  });
});

describe('serialize, plainText, storedLength', () => {
  const segments: Segment[] = [
    { kind: 'text', text: 'hi ' },
    { kind: 'mention', userId: ID, name: 'Priya Shah' },
  ];

  it('writes the markup, shows the name only, and counts what is stored', () => {
    expect(serialize(segments)).toBe(`hi @[Priya Shah](${ID})`);
    expect(plainText(segments)).toBe('hi @Priya Shah');
    expect(storedLength(segments)).toBe(`hi @[Priya Shah](${ID})`.length);
  });

  it('strips brackets and parentheses from a stored name so the markup always parses', () => {
    expect(cleanName('Bao [the] (Great)')).toBe('Bao the Great');
    const stored = serialize([{ kind: 'mention', userId: ID, name: 'Bao [x] (y)' }]);
    expect(parseMarkup(stored)).toEqual([{ kind: 'mention', userId: ID, name: 'Bao x y' }]);
    expect(cleanName('[]()')).toBe('?');
  });

  it('round-trips', () => {
    expect(parseMarkup(serialize(segments))).toEqual(segments);
  });
});

describe('isEmptyDraft, trimSegments, clipSegments', () => {
  it('is empty with no tag and only blanks', () => {
    expect(isEmptyDraft([])).toBe(true);
    expect(isEmptyDraft([{ kind: 'text', text: '  ' }])).toBe(true);
    expect(isEmptyDraft([{ kind: 'mention', userId: ID, name: 'A' }])).toBe(false);
  });

  it('trims the blanks around the whole text, not around a tag', () => {
    expect(
      trimSegments([
        { kind: 'text', text: '  hi ' },
        { kind: 'mention', userId: ID, name: 'A' },
        { kind: 'text', text: ' x  ' },
      ]),
    ).toEqual([
      { kind: 'text', text: 'hi ' },
      { kind: 'mention', userId: ID, name: 'A' },
      { kind: 'text', text: ' x' },
    ]);
  });

  it('cuts the end to the limit: text by characters, a tag whole or not at all', () => {
    const tag: Segment = { kind: 'mention', userId: ID, name: 'A' };
    const tagLength = storedLength([tag]);
    expect(clipSegments([{ kind: 'text', text: 'abcdef' }], 4)).toEqual([{ kind: 'text', text: 'abcd' }]);
    expect(clipSegments([{ kind: 'text', text: 'ab' }, tag], 2 + tagLength - 1)).toEqual([
      { kind: 'text', text: 'ab' },
    ]);
    expect(clipSegments([{ kind: 'text', text: 'ab' }, tag], 2 + tagLength)).toHaveLength(2);
  });
});
