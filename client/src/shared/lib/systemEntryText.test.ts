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

  // CLIENT-GROUP-SESSION-4: the group-session configuration entries. `mode` and `day` arrive raw and are turned into a word and a phrase.
  it.each([
    ['GROUP_SESSION_RECURRENCE_ADDED', { name: 'Bao', mode: 'WEEKLY', day: '1', time: '18:30' }, 'Bao added a weekly session on Monday at 18:30', 'Bao đã thêm một buổi chơi hằng tuần vào Thứ Hai lúc 18:30'],
    ['GROUP_SESSION_RECURRENCE_ADDED', { name: 'Bao', mode: 'MONTHLY', day: '12', time: '07:00' }, 'Bao added a monthly session on the 12th at 07:00', 'Bao đã thêm một buổi chơi hằng tháng vào ngày 12 lúc 07:00'],
    ['GROUP_SESSION_RECURRENCE_UPDATED', { name: 'Bao', mode: 'MONTHLY', day: '2', time: '19:15' }, 'Bao changed the monthly session on the 2nd at 19:15', 'Bao đã thay đổi buổi chơi hằng tháng vào ngày 2 lúc 19:15'],
    ['GROUP_SESSION_RECURRENCE_DELETED', { name: 'Bao', mode: 'WEEKLY', day: '7', time: '09:00' }, 'Bao deleted the weekly session on Sunday at 09:00', 'Bao đã xóa buổi chơi hằng tuần vào Chủ Nhật lúc 09:00'],
    ['GROUP_SESSION_GENERATION_ON', { name: 'Bao', mode: 'WEEKLY' }, 'Bao turned on regular sessions (weekly)', 'Bao đã bật tự động tạo buổi chơi định kỳ (hằng tuần)'],
    ['GROUP_SESSION_GENERATION_OFF', { name: 'Bao', mode: 'MONTHLY' }, 'Bao turned off regular sessions', 'Bao đã tắt tự động tạo buổi chơi định kỳ'],
    ['GROUP_SESSION_MODE_CHANGED', { name: 'Bao', mode: 'MONTHLY' }, 'Bao changed the recurrence to monthly', 'Bao đã đổi chu kỳ lặp sang hằng tháng'],
  ])('%s reads in English and Vietnamese, with the mode as a word and the day as a phrase', async (code, params, en, vi) => {
    expect(systemEntryText(code, params, 'stored content')).toBe(en);
    await i18n.changeLanguage('vi');
    expect(systemEntryText(code, params, 'stored content')).toBe(vi);
  });

  it('keeps the stored text for a recurrence entry whose day or time cannot be read (no hole in the sentence)', () => {
    const base = { name: 'Bao', mode: 'WEEKLY', day: '1', time: '18:30' };
    expect(systemEntryText('GROUP_SESSION_RECURRENCE_ADDED', { ...base, time: '' }, 'stored')).toBe('stored');
    expect(systemEntryText('GROUP_SESSION_RECURRENCE_ADDED', { name: 'Bao', mode: 'WEEKLY', time: '18:30' }, 'stored')).toBe('stored');
    // A day outside the mode (a weekday is 1 to 7) is left raw, so the template still fills but never names a wrong day.
    expect(systemEntryText('GROUP_SESSION_RECURRENCE_ADDED', { ...base, day: '9' }, 'stored')).not.toContain('Monday');
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
