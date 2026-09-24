import { beforeEach, describe, expect, it } from 'vitest';
import { useJoinFeedbackStore } from './joinFeedbackStore';

describe('joinFeedbackStore', () => {
  beforeEach(() => useJoinFeedbackStore.setState({ kind: null, openSessionId: null }));

  it('starts closed', () => {
    expect(useJoinFeedbackStore.getState().kind).toBeNull();
  });

  it('show opens the given kind, and a later show replaces it', () => {
    useJoinFeedbackStore.getState().show('REQUESTED');
    expect(useJoinFeedbackStore.getState().kind).toBe('REQUESTED');
    useJoinFeedbackStore.getState().show('JOINED');
    expect(useJoinFeedbackStore.getState().kind).toBe('JOINED');
  });

  it('show without a session id offers nothing to open; with one, it remembers it', () => {
    useJoinFeedbackStore.getState().show('JOINED');
    expect(useJoinFeedbackStore.getState().openSessionId).toBeNull();
    useJoinFeedbackStore.getState().show('JOINED', 7);
    expect(useJoinFeedbackStore.getState().openSessionId).toBe(7);
  });

  it('dismiss closes it', () => {
    useJoinFeedbackStore.getState().show('JOINED', 7);
    useJoinFeedbackStore.getState().dismiss();
    expect(useJoinFeedbackStore.getState().kind).toBeNull();
    expect(useJoinFeedbackStore.getState().openSessionId).toBeNull();
  });
});
