import { beforeEach, describe, expect, it } from 'vitest';
import { useMatchesPageStore } from './matchesPageStore';

describe('matchesPageStore', () => {
  beforeEach(() => {
    useMatchesPageStore.setState({ activeSport: 'all' });
  });

  it('starts with "all" active sport', () => {
    expect(useMatchesPageStore.getState().activeSport).toBe('all');
  });

  it('setActiveSport updates the sport', () => {
    useMatchesPageStore.getState().setActiveSport('tennis');
    expect(useMatchesPageStore.getState().activeSport).toBe('tennis');
  });

  // Same "each page owns its own sport pill, independently" precedent as homeFeedStore/groupsPageStore.
  it('is a completely separate store from homeFeedStore', async () => {
    const { useHomeFeedStore } = await import('./homeFeedStore');
    useHomeFeedStore.setState({ activeSport: 'all' });

    useMatchesPageStore.getState().setActiveSport('basketball');

    expect(useHomeFeedStore.getState().activeSport).toBe('all');
  });
});
