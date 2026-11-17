import { afterEach, describe, expect, it } from 'vitest';
import i18n from '@/app/i18n';
import { systemEntryText } from './systemEntryText';

describe('systemEntryText (CLIENT-GL-51)', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it.each([
    ['SESSION_JOINED', { name: 'Linh' }, 'Linh joined the session', 'Linh đã tham gia buổi chơi'],
    ['SESSION_LEFT', { name: 'Linh' }, 'Linh left the session', 'Linh đã rời buổi chơi'],
    ['SESSION_STARTED', {}, 'The session has started', 'Buổi chơi đã bắt đầu'],
    ['SESSION_RECORDS_UPDATED', { name: 'Linh' }, 'Linh has updated the result', 'Linh đã cập nhật kết quả'],
    ['GROUP_MEMBER_JOINED', { name: 'Linh' }, 'Linh joined the group 👋', 'Linh đã tham gia nhóm 👋'],
    [
      'GROUP_MEMBER_JOINED_INVITED',
      { name: 'Linh', inviter: 'Bao' },
      'Linh joined the group — invited by Bao 👋',
      'Linh đã tham gia nhóm — được Bao mời 👋',
    ],
  ])('%s reads in English and Vietnamese from its params', async (code, params, en, vi) => {
    expect(systemEntryText(code, params, 'stored content')).toBe(en);
    await i18n.changeLanguage('vi');
    expect(systemEntryText(code, params, 'stored content')).toBe(vi);
  });

  it('keeps the stored content for an entry without a code (written before SESSION-GL-63)', () => {
    expect(systemEntryText(null, null, 'Linh joined the session')).toBe('Linh joined the session');
    expect(systemEntryText(undefined, undefined, 'Linh joined the session')).toBe('Linh joined the session');
  });

  it('keeps the stored content for a code this client does not know (a newer server)', () => {
    expect(systemEntryText('SESSION_SOMETHING_NEW', { name: 'Linh' }, 'stored content')).toBe('stored content');
  });

  it('keeps the stored content when a param the sentence needs is missing', () => {
    expect(systemEntryText('SESSION_JOINED', {}, 'stored content')).toBe('stored content');
    expect(systemEntryText('SESSION_JOINED', null, 'stored content')).toBe('stored content');
    expect(systemEntryText('GROUP_MEMBER_JOINED_INVITED', { name: 'Linh' }, 'stored content')).toBe('stored content');
  });

  it('does not HTML-escape a name', () => {
    expect(systemEntryText('SESSION_JOINED', { name: "D'Arcy <3" }, 'x')).toBe("D'Arcy <3 joined the session");
  });
});
