import { beforeEach, describe, expect, it } from 'vitest';
import { useHomeFeedStore } from './homeFeedStore';

describe('homeFeedStore', () => {
  beforeEach(() => {
    useHomeFeedStore.setState({ activeSport: 'all' });
  });

  it('starts with "all" active sport', () => {
    expect(useHomeFeedStore.getState().activeSport).toBe('all');
  });

  it('setActiveSport updates the sport', () => {
    useHomeFeedStore.getState().setActiveSport('football');

    expect(useHomeFeedStore.getState().activeSport).toBe('football');
  });

  // 2026-07-25: independent from the Groups page's own store — switching
  // sport here must never be observable from groupsPageStore.
  it('is a completely separate store from groupsPageStore', async () => {
    const { useGroupsPageStore } = await import('./groupsPageStore');
    useGroupsPageStore.setState({ activeSport: 'all', selectedGroupId: null, selectedGroupSportId: null });

    useHomeFeedStore.getState().setActiveSport('basketball');

    expect(useGroupsPageStore.getState().activeSport).toBe('all');
  });
});
