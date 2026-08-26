import { beforeEach, describe, expect, it } from 'vitest';
import { useProfilePageStore } from './profilePageStore';

describe('profilePageStore', () => {
  beforeEach(() => {
    useProfilePageStore.setState({ activeSport: 'all' });
  });

  it('starts with "all" active sport', () => {
    expect(useProfilePageStore.getState().activeSport).toBe('all');
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
