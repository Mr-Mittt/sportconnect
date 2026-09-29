import { afterEach, describe, expect, it } from 'vitest';
import i18n from '@/app/i18n';
import { formatTypingLabel } from './typingLabel';

const alex = { userId: '1', displayName: 'Alex' };
const sam = { userId: '2', displayName: 'Sam' };
const kim = { userId: '3', displayName: 'Kim' };

describe('formatTypingLabel', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('returns null when nobody is typing', () => {
    expect(formatTypingLabel([])).toBeNull();
  });

  it('formats one, two and many typers in English', () => {
    expect(formatTypingLabel([alex])).toBe('Alex is typing…');
    expect(formatTypingLabel([alex, sam])).toBe('Alex and Sam are typing…');
    expect(formatTypingLabel([alex, sam, kim])).toBe('3 people are typing…');
  });

  // CLIENT-I18N-7: shared by the group and direct chat panels — localized once, here.
  it('formats one, two and many typers in Vietnamese', async () => {
    await i18n.changeLanguage('vi');
    expect(formatTypingLabel([alex])).toBe('Alex đang nhập…');
    expect(formatTypingLabel([alex, sam])).toBe('Alex và Sam đang nhập…');
    expect(formatTypingLabel([alex, sam, kim])).toBe('3 người đang nhập…');
  });
});
