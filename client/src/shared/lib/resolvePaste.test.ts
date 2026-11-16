import { describe, expect, it } from 'vitest';
import { resolvePaste } from './resolvePaste';

// CLIENT-GL-50: a pasted record command turns its `@name`s into chips.

const people = [
  { id: 'u-bao', name: 'Bao' },
  { id: 'u-bao15', name: 'Bao 15' },
  { id: 'u-an', name: 'An' },
  { id: 'u-binh', name: 'Bình' },
];

describe('resolvePaste', () => {
  it('turns a known @name into a chip and keeps the rest as text', () => {
    const { segments, trailingQuery } = resolvePaste(':add @An 21 vs 15 @Bình 3', people);
    expect(segments).toEqual([
      { kind: 'text', text: ':add ' },
      { kind: 'mention', userId: 'u-an', name: 'An' },
      { kind: 'text', text: ' 21 vs 15 @Bình 3' },
    ]);
    // the last `@word` is left open for the picker
    expect(trailingQuery).toBe('Bình 3');
  });

  it('takes the longest name that fits: @Bao 15 is "Bao 15"', () => {
    const { segments } = resolvePaste('@Bao 15 @Bao ', people);
    expect(segments).toEqual([
      { kind: 'mention', userId: 'u-bao15', name: 'Bao 15' },
      { kind: 'text', text: ' @Bao' },
    ]);
  });

  it('removes the trailing blanks of the last @word and reports it for the picker', () => {
    const { segments, trailingQuery } = resolvePaste(':add @An vs @Bao ', people);
    expect(segments).toEqual([
      { kind: 'text', text: ':add ' },
      { kind: 'mention', userId: 'u-an', name: 'An' },
      { kind: 'text', text: ' vs @Bao' },
    ]);
    expect(trailingQuery).toBe('Bao');
  });

  it('leaves a name nobody has as plain text', () => {
    const { segments } = resolvePaste(':add @Zed 21 vs 15 @An 3 @Bao', people);
    expect(segments).toEqual([
      { kind: 'text', text: ':add @Zed 21 vs 15 ' },
      { kind: 'mention', userId: 'u-an', name: 'An' },
      { kind: 'text', text: ' 3 @Bao' },
    ]);
  });

  it('needs a blank or the end after the name, and a blank before the @', () => {
    expect(resolvePaste(':add @Anna 1 vs 2 x', people).segments).toEqual([
      { kind: 'text', text: ':add @Anna 1 vs 2 x' },
    ]);
    expect(resolvePaste('mail a@An b', people).segments).toEqual([{ kind: 'text', text: 'mail a@An b' }]);
  });

  it('picks the first of two equally long names, ignoring case', () => {
    const twins = [
      { id: 'a', name: 'Nam' },
      { id: 'b', name: 'Nam' },
    ];
    expect(resolvePaste('@nam 1 @', twins).segments[0]).toEqual({ kind: 'mention', userId: 'a', name: 'Nam' });
  });

  it('has no trailing query when the text does not end in an @ word', () => {
    expect(resolvePaste(':del 7', people).trailingQuery).toBeNull();
  });
});
