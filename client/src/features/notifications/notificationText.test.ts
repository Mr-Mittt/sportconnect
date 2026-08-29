import { describe, expect, it, vi } from 'vitest';
import { getNotificationText, notificationTextToString } from './notificationText';
import type { Notification, NotificationType } from './types';

function baseNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 1,
    type: 'session.comment.created',
    entityType: 'SESSION',
    entityId: '42',
    actorIds: ['actor-1'],
    actorCount: 1,
    isRead: false,
    createdAt: '2026-08-18T10:00:00',
    updatedAt: '2026-08-18T10:00:00',
    actors: [{ id: 'actor-1', fullName: 'Alice Nguyen' }],
    entityTitle: 'Friday Pickup Game',
    ...overrides,
  };
}

describe('getNotificationText', () => {
  it('renders a single actor by name for session.comment.created, with only the actor and title bold', () => {
    const segments = getNotificationText(baseNotification());
    expect(notificationTextToString(segments)).toBe('Alice Nguyen commented on "Friday Pickup Game"');
    expect(segments).toEqual([
      { text: 'Alice Nguyen', bold: true },
      { text: ' commented on ', bold: false },
      { text: '"Friday Pickup Game"', bold: true },
    ]);
  });

  it('renders "and N others" from distinct actors.length, not actorCount, as one bold segment', () => {
    const notification = baseNotification({
      actorCount: 5,
      actors: [
        { id: 'a1', fullName: 'Alice Nguyen' },
        { id: 'a2', fullName: 'Bao Tran' },
        { id: 'a3', fullName: 'Chi Le' },
      ],
    });
    const segments = getNotificationText(notification);
    expect(notificationTextToString(segments)).toBe('Alice Nguyen and 2 others commented on "Friday Pickup Game"');
    expect(segments[0]).toEqual({ text: 'Alice Nguyen and 2 others', bold: true });
  });

  it('does not say "and others" when actorCount exceeds actors.length due to one repeat actor', () => {
    const notification = baseNotification({ actorCount: 4, actors: [{ id: 'a1', fullName: 'Alice Nguyen' }] });
    expect(notificationTextToString(getNotificationText(notification))).toBe(
      'Alice Nguyen commented on "Friday Pickup Game"',
    );
  });

  it('falls back to "Someone" (not bold) when actors is empty (every actorId was missing from user-api)', () => {
    const segments = getNotificationText(baseNotification({ actors: [] }));
    expect(segments[0]).toEqual({ text: 'Someone', bold: false });
    expect(notificationTextToString(segments)).toBe('Someone commented on "Friday Pickup Game"');
  });

  it('falls back to "your session" (not bold) when entityTitle is null', () => {
    const segments = getNotificationText(baseNotification({ entityTitle: null }));
    expect(segments.at(-1)).toEqual({ text: 'your session', bold: false });
    expect(notificationTextToString(segments)).toBe('Alice Nguyen commented on your session');
  });

  it.each([
    ['session.participant.joined', 'Alice Nguyen joined "Friday Pickup Game"'],
    ['session.join_request.created', 'Alice Nguyen requested to join "Friday Pickup Game"'],
    ['session.join_request.approved', 'Your request to join "Friday Pickup Game" was approved'],
    ['session.join_request.rejected', 'Your request to join "Friday Pickup Game" was declined'],
    ['session.invitation.created', 'Alice Nguyen invited you to join "Friday Pickup Game"'],
    ['session.participant.left', 'Alice Nguyen left "Friday Pickup Game"'],
    ['session.status.started', '"Friday Pickup Game" has started'],
    ['user.friend_request.created', 'Alice Nguyen wants to be your friend'],
    ['user.friend_request.accepted', 'Alice Nguyen is now your friend'],
  ] as [NotificationType, string][])('renders %s correctly', (type, expected) => {
    expect(notificationTextToString(getNotificationText(baseNotification({ type })))).toBe(expected);
  });

  it.each([
    'user.friend_request.created',
    'user.friend_request.accepted',
  ] as NotificationType[])('%s bolds only the actor name — no entity segment (USER entity has no title)', (type) => {
    const segments = getNotificationText(baseNotification({ type }));
    expect(segments.filter((s) => s.bold)).toEqual([{ text: 'Alice Nguyen', bold: true }]);
  });

  it('the approval/rejection outcome types never bold an actor (the text never names one)', () => {
    const segments = getNotificationText(baseNotification({ type: 'session.join_request.approved' }));
    expect(segments.filter((s) => s.bold)).toEqual([{ text: '"Friday Pickup Game"', bold: true }]);
  });

  it('session.status.started names no actor even if one is somehow present (the job, not a person, started it)', () => {
    const segments = getNotificationText(
      baseNotification({ type: 'session.status.started', actors: [{ id: 'a1', fullName: 'Alice Nguyen' }] }),
    );
    expect(notificationTextToString(segments)).toBe('"Friday Pickup Game" has started');
    expect(segments.filter((s) => s.bold)).toEqual([{ text: '"Friday Pickup Game"', bold: true }]);
  });

  it('session.status.started falls back to "your session" (not bold) when entityTitle is null', () => {
    const segments = getNotificationText(baseNotification({ type: 'session.status.started', entityTitle: null }));
    expect(segments[0]).toEqual({ text: 'your session', bold: false });
    expect(notificationTextToString(segments)).toBe('your session has started');
  });

  // NOTE: the type here must stay one the backend can never emit. It used to be
  // 'post.comment.created', which post-impl B7 is queued to make a real routing
  // key — at which point this test would still pass while silently asserting
  // "known-but-unimplemented" rather than "genuinely unknown".
  // CLIENT-NOTIF-4 typed `Notification.type` as a union, so simulating a type this build has never
  // heard of now needs an explicit cast. The cast is the point of these two tests, not a workaround:
  // a client deployed older than the backend really does receive out-of-union values, which is
  // exactly what the runtime fallback exists for and what no amount of typing can prevent. If these
  // ever stop needing a cast, the union has grown a member that should have its own case instead.
  it('falls back to a generic sentence for an unrecognized type (forward-compat with future producers)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const segments = getNotificationText(baseNotification({ type: 'not.a.real.routing.key' as NotificationType }));
    expect(segments).toEqual([{ text: 'You have a new notification', bold: false }]);
    warn.mockRestore();
  });

  it('warns in dev when a type hits the fallback, so a new producer is not silently degraded', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    getNotificationText(baseNotification({ type: 'not.a.real.routing.key' as NotificationType }));
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).toContain('not.a.real.routing.key');
    warn.mockRestore();
  });

  it('does not warn for a type it knows how to render', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    getNotificationText(baseNotification({ type: 'session.status.started' }));
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
