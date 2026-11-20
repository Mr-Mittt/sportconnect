import { describe, expect, it } from 'vitest';
import { toAudienceResults } from './audienceResults';

const found = [
  { userId: 'me', fullName: 'Jordan Lee', avatarUrl: null },
  { userId: 'u-2', fullName: 'Linh Tran', avatarUrl: '/a.png' },
  { userId: 'u-3', fullName: 'Minh Le', avatarUrl: null },
];

describe('toAudienceResults (CLIENT-GROUP-SESSION-1)', () => {
  it("never offers the caller, and keeps the server's order", () => {
    expect(toAudienceResults(found, 'me').map((member) => member.id)).toEqual(['u-2', 'u-3']);
  });

  it('maps each person to the picker shape', () => {
    expect(toAudienceResults(found, 'me')[0]).toEqual({ id: 'u-2', name: 'Linh Tran', avatarUrl: '/a.png' });
  });

  it('is empty before the first answer', () => {
    expect(toAudienceResults(undefined, 'me')).toEqual([]);
  });

  it('keeps everyone while the caller is not known yet', () => {
    expect(toAudienceResults(found, undefined)).toHaveLength(3);
  });
});
