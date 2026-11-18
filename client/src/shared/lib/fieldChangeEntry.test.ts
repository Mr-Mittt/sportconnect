import { afterEach, describe, expect, it } from 'vitest';
import i18n from '@/app/i18n';
import { FIELD_CHANGE_CODES, isFieldChangeCode, type FieldChangeCode } from './fieldChangeEntry';
import { systemEntryText } from './systemEntryText';

/** Local 18:00 and 19:00 on Fri 20 Nov 2026 as ISO instants: the sentence shows them in the viewer's zone. */
const SIX_PM = new Date(2026, 10, 20, 18, 0).toISOString();
const SEVEN_PM = new Date(2026, 10, 20, 19, 0).toISOString();

const text = (code: string, params: Record<string, string>) => systemEntryText(code, params, 'stored content');

async function inBoth(code: string, params: Record<string, string>, en: string, vi: string) {
  expect(text(code, params)).toBe(en);
  await i18n.changeLanguage('vi');
  expect(text(code, params)).toBe(vi);
}

describe('field change entries (CLIENT-SESSION-51)', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  describe('free-text fields: added, updated, removed', () => {
    const fields: [FieldChangeCode, string, string][] = [
      ['SESSION_TITLE_CHANGED', 'title', 'tên'],
      ['SESSION_LOCATION_NOTE_CHANGED', 'location note', 'ghi chú địa điểm'],
      ['SESSION_FEE_NOTE_CHANGED', 'fee note', 'ghi chú phí'],
    ];

    it.each(fields)('%s reads "added" when there was no value', async (code, en, vi) => {
      await inBoth(
        code,
        { name: 'Alex', old: '', new: 'Bring cash' },
        `Alex added the ${en} "Bring cash"`,
        `Alex đã thêm ${vi} "Bring cash"`,
      );
    });

    it.each(fields)('%s reads "updated" with only the new text, never "from ... to"', async (code, en, vi) => {
      await inBoth(
        code,
        { name: 'Alex', old: 'Cash only', new: 'Bring cash' },
        `Alex updated the ${en} "Bring cash"`,
        `Alex đã cập nhật ${vi} "Bring cash"`,
      );
    });

    it.each(fields)('%s reads "removed" without a value', async (code, en, vi) => {
      await inBoth(code, { name: 'Alex', old: 'Bring cash', new: '' }, `Alex removed the ${en}`, `Alex đã xóa ${vi}`);
    });
  });

  describe('every other field: added, changed, removed', () => {
    it('location', async () => {
      await inBoth(
        'SESSION_LOCATION_CHANGED',
        { name: 'Alex', old: 'Court A', new: 'Court B' },
        'Alex changed the location from "Court A" to "Court B"',
        'Alex đã đổi địa điểm từ "Court A" sang "Court B"',
      );
      await i18n.changeLanguage('en');
      expect(text('SESSION_LOCATION_CHANGED', { name: 'Alex', old: '', new: 'Court B' })).toBe(
        'Alex added the location "Court B"',
      );
    });

    it('start time is shown in the viewer zone and language', async () => {
      expect(text('SESSION_START_CHANGED', { name: 'Alex', old: SIX_PM, new: SEVEN_PM })).toBe(
        'Alex changed the start time from "Fri, Nov 20 · 18:00" to "Fri, Nov 20 · 19:00"',
      );
      expect(text('SESSION_START_CHANGED', { name: 'Alex', old: '', new: SEVEN_PM })).toBe(
        'Alex added the start time "Fri, Nov 20 · 19:00"',
      );
      await i18n.changeLanguage('vi');
      expect(text('SESSION_START_CHANGED', { name: 'Alex', old: SIX_PM, new: SEVEN_PM })).toBe(
        'Alex đã đổi giờ bắt đầu từ "Thứ 6, 20 thg 11 · 18:00" sang "Thứ 6, 20 thg 11 · 19:00"',
      );
    });

    it('duration is minutes with a unit, and can be added', async () => {
      await inBoth(
        'SESSION_DURATION_CHANGED',
        { name: 'Alex', old: '60', new: '90' },
        'Alex changed the duration from "60 min" to "90 min"',
        'Alex đã đổi thời lượng từ "60 phút" sang "90 phút"',
      );
      await i18n.changeLanguage('en');
      expect(text('SESSION_DURATION_CHANGED', { name: 'Alex', old: '', new: '90' })).toBe(
        'Alex added the duration "90 min"',
      );
    });

    it.each([
      ['SESSION_CAPACITY_CHANGED', 'capacity', 'sức chứa'],
      ['SESSION_INITIAL_SLOT_CHANGED', 'taken slots', 'số người chơi có sẵn'],
      ['SESSION_MALE_SLOTS_CHANGED', 'male slots', 'chỗ trống cho nam'],
      ['SESSION_FEMALE_SLOTS_CHANGED', 'female slots', 'chỗ trống cho nữ'],
    ])('%s shows the numbers as sent, and reads added and removed', async (code, en, vi) => {
      await inBoth(
        code,
        { name: 'Alex', old: '10', new: '20' },
        `Alex changed the ${en} from "10" to "20"`,
        `Alex đã đổi ${vi} từ "10" sang "20"`,
      );
      await i18n.changeLanguage('en');
      expect(text(code, { name: 'Alex', old: '', new: '2' })).toBe(`Alex added the ${en} "2"`);
      expect(text(code, { name: 'Alex', old: '3', new: '' })).toBe(`Alex removed the ${en}`);
    });

    it('game mood shows the number with its level', async () => {
      await inBoth(
        'SESSION_GAME_MOOD_CHANGED',
        { name: 'Alex', old: '5', new: '8' },
        'Alex changed the game mood from "5 · Normal" to "8 · Competitive"',
        'Alex đã đổi cường độ từ "5 · Bình thường" sang "8 · Thi đấu"',
      );
    });

    it('auto approve shows the approval label, not true or false', async () => {
      await inBoth(
        'SESSION_AUTO_APPROVE_CHANGED',
        { name: 'Alex', old: 'false', new: 'true' },
        'Alex changed the approval from "Need host approval" to "Auto approval"',
        'Alex đã đổi cách duyệt tham gia từ "Cần chủ trận duyệt" sang "Tự động duyệt"',
      );
    });
  });

  describe('visibility (SESSION-69)', () => {
    it('reads public to private with the labels, in both languages', async () => {
      await inBoth(
        'SESSION_VISIBILITY_CHANGED',
        { name: 'Alex', old: 'public', new: 'private' },
        'Alex changed the visibility from "Public" to "Private"',
        'Alex đã đổi chế độ hiển thị từ "Công khai" sang "Riêng tư"',
      );
    });

    it('reads private to public with the labels, in both languages', async () => {
      await inBoth(
        'SESSION_VISIBILITY_CHANGED',
        { name: 'Alex', old: 'private', new: 'public' },
        'Alex changed the visibility from "Private" to "Public"',
        'Alex đã đổi chế độ hiển thị từ "Riêng tư" sang "Công khai"',
      );
    });

    it('falls back to the stored text for a value it does not know', () => {
      expect(text('SESSION_VISIBILITY_CHANGED', { name: 'Alex', old: 'public', new: 'secret' })).toBe('stored content');
    });
  });

  describe('the fee: type and amount on each side as one value', () => {
    const fee = (oldType: string, oldAmount: string, newType: string, newAmount: string) => ({
      name: 'Alex',
      oldFeeType: oldType,
      oldFeeAmountVnd: oldAmount,
      newFeeType: newType,
      newFeeAmountVnd: newAmount,
    });

    it('free to split', async () => {
      await inBoth(
        'SESSION_FEE_CHANGED',
        fee('FREE', '', 'SPLIT', ''),
        'Alex changed the fee from "Free" to "Split cost"',
        'Alex đã đổi phí từ "Miễn phí" sang "Phí chia đều"',
      );
    });

    it('a fixed amount is formatted as money, and a change of amount alone is a change', () => {
      expect(text('SESSION_FEE_CHANGED', fee('FIXED', '50000', 'FIXED', '60000'))).toBe(
        'Alex changed the fee from "50 000 ₫" to "60 000 ₫"',
      );
      expect(text('SESSION_FEE_CHANGED', fee('FIXED', '50000', 'FREE', ''))).toBe(
        'Alex changed the fee from "50 000 ₫" to "Free"',
      );
    });

    it('a fee that was not set yet is "added"', () => {
      expect(text('SESSION_FEE_CHANGED', fee('', '', 'FIXED', '50000'))).toBe('Alex added the fee "50 000 ₫"');
    });
  });

  it('the attributes comment has only the editor and no values', async () => {
    await inBoth(
      'SESSION_ATTRIBUTES_CHANGED',
      { name: 'Alex' },
      'Alex updated the sport details',
      'Alex đã cập nhật thông tin môn chơi',
    );
  });

  it('shows a name and a value as written, nothing escaped', () => {
    expect(text('SESSION_TITLE_CHANGED', { name: "D'Arcy <3", old: '', new: 'Fri "late" <b>run</b> & more' })).toBe(
      'D\'Arcy <3 added the title "Fri "late" <b>run</b> & more"',
    );
  });

  describe('keeps the stored English content when the sentence cannot be shown faithfully', () => {
    it.each(FIELD_CHANGE_CODES.filter((c) => c !== 'SESSION_FEE_CHANGED'))('%s: no name', (code) => {
      expect(text(code, { old: '1', new: '2' })).toBe('stored content');
      expect(text(code, { name: '', old: '1', new: '2' })).toBe('stored content');
    });

    it.each(FIELD_CHANGE_CODES.filter((c) => c !== 'SESSION_FEE_CHANGED'))('%s: an old or new param is absent', (code) => {
      expect(text(code, { name: 'Alex', new: '2' })).toBe('stored content');
      expect(text(code, { name: 'Alex', old: '2' })).toBe('stored content');
      expect(systemEntryText(code, null, 'stored content')).toBe('stored content');
    });

    it.each(FIELD_CHANGE_CODES.filter((c) => c !== 'SESSION_FEE_CHANGED'))('%s: both sides empty', (code) => {
      expect(text(code, { name: 'Alex', old: '', new: '' })).toBe('stored content');
    });

    it('a start that is not an instant, a duration or mood that is not a number, an approval that is not a boolean', () => {
      expect(text('SESSION_START_CHANGED', { name: 'Alex', old: 'soon', new: SEVEN_PM })).toBe('stored content');
      expect(text('SESSION_START_CHANGED', { name: 'Alex', old: '', new: 'soon' })).toBe('stored content');
      expect(text('SESSION_DURATION_CHANGED', { name: 'Alex', old: '60', new: 'long' })).toBe('stored content');
      expect(text('SESSION_GAME_MOOD_CHANGED', { name: 'Alex', old: '5', new: 'high' })).toBe('stored content');
      expect(text('SESSION_AUTO_APPROVE_CHANGED', { name: 'Alex', old: 'false', new: 'maybe' })).toBe('stored content');
    });

    it('a fee with a missing param, an unknown type, a fixed amount that is not a number, or nothing on both sides', () => {
      const base = { name: 'Alex', oldFeeType: 'FREE', oldFeeAmountVnd: '', newFeeType: 'SPLIT', newFeeAmountVnd: '' };
      expect(text('SESSION_FEE_CHANGED', base)).not.toBe('stored content');
      expect(text('SESSION_FEE_CHANGED', { ...base, name: '' })).toBe('stored content');
      expect(text('SESSION_FEE_CHANGED', { name: 'Alex', oldFeeType: 'FREE', oldFeeAmountVnd: '', newFeeType: 'SPLIT' })).toBe(
        'stored content',
      );
      expect(text('SESSION_FEE_CHANGED', { ...base, newFeeType: 'DONATION' })).toBe('stored content');
      expect(text('SESSION_FEE_CHANGED', { ...base, newFeeType: 'FIXED', newFeeAmountVnd: '' })).toBe('stored content');
      expect(text('SESSION_FEE_CHANGED', { ...base, oldFeeType: '', newFeeType: '' })).toBe('stored content');
      expect(text('SESSION_FEE_CHANGED', { name: 'Alex', old: '1', new: '2' })).toBe('stored content');
    });
  });

  it('knows exactly the fourteen field codes (the attributes code is an ordinary template)', () => {
    expect(FIELD_CHANGE_CODES).toHaveLength(14);
    expect(isFieldChangeCode('SESSION_TITLE_CHANGED')).toBe(true);
    expect(isFieldChangeCode('SESSION_ATTRIBUTES_CHANGED')).toBe(false);
    expect(isFieldChangeCode('SESSION_JOINED')).toBe(false);
  });
});
