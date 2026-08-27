import { beforeEach, describe, expect, it } from 'vitest';
import { useProfilePageStore } from './profilePageStore';

describe('profilePageStore', () => {
  beforeEach(() => {
    useProfilePageStore.setState({ activeSport: null });
  });

  it('starts with no active sport resolved yet', () => {
    expect(useProfilePageStore.getState().activeSport).toBeNull();
  });

  it('setActiveSport updates the sport', () => {
    useProfilePageStore.getState().setActiveSport('football');

    expect(useProfilePageStore.getState().activeSport).toBe('football');
  });

  it('is a completely separate store from homeFeedStore', async () => {
    const { useHomeFeedStore } = await import('./homeFeedStore');
    useHomeFeedStore.setState({ activeSport: 'all' });

    useProfilePageStore.getState().setActiveSport('basketball');

    expect(useHomeFeedStore.getState().activeSport).toBe('all');
  });
});
