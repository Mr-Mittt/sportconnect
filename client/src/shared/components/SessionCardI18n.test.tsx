import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import i18n from '@/app/i18n';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { Session } from '@/shared/types/session';
import { SessionCard } from './SessionCard';

const sportsByKey: Record<SportKey, SportProfile> = {
  football: { key: 'football', label: 'Football', iconUrl: '/images/sports/football.png', colorRamp: 'teal' },
  basketball: { key: 'basketball', label: 'Basketball', iconUrl: '/images/sports/basketball.png', colorRamp: 'coral' },
  tennis: { key: 'tennis', label: 'Tennis', iconUrl: '/images/sports/tennis.png', colorRamp: 'purple' },
};

const session = {
  id: 1,
  groupId: null,
  sessionType: 'STANDALONE',
  createdBy: 'user-1',
  createdByFullName: 'Jordan Lee',
  sportId: 6,
  sportName: 'Basketball',
  title: null,
  description: null,
  location: null,
  locationNote: null,
  scheduledStart: '2026-08-01T19:00:00',
  scheduledEndAt: null,
  status: 'SCHEDULED',
  participantCount: 3,
  capacity: 10,
  feeType: null,
  feeAmountVnd: null,
  callerParticipation: null,
} as unknown as Session;

function renderCard(i18nOverridePrefix?: string) {
  return render(
    <SessionCard
      session={session}
      sportsByKey={sportsByKey}
      currentUserId="user-2"
      onViewDetails={() => {}}
      onParticipationAction={() => {}}
      isParticipationActionPending={() => false}
      i18nOverridePrefix={i18nOverridePrefix}
    />,
  );
}

describe('SessionCard i18n', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders Vietnamese copy when the locale is vi', async () => {
    await i18n.changeLanguage('vi');
    renderCard();
    expect(screen.getByText('Buổi chơi Basketball')).toBeInTheDocument();
    expect(screen.getByText('Chưa có địa điểm')).toBeInTheDocument();
    expect(screen.getByText('Chưa có mức phí')).toBeInTheDocument();
    expect(screen.getByText('3/10 người tham gia')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buổi chơi Basketball — Xem chi tiết' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buổi chơi Basketball — Tham gia' })).toBeInTheDocument();
  });

  it('prefers an override-prefix key over the default copy', () => {
    i18n.addResourceBundle('en', 'sessionOverrideTest', { custom: { card: { viewDetails: 'Open it' } } }, true, true);
    renderCard('sessionOverrideTest:custom');
    expect(screen.getByText('Open it')).toBeInTheDocument();
    expect(screen.getByText('Location pending')).toBeInTheDocument(); // un-overridden key falls back
  });
});
