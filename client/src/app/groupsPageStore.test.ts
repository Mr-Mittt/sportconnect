import { beforeEach, describe, expect, it } from 'vitest';
import { useGroupsPageStore } from './groupsPageStore';

describe('groupsPageStore', () => {
  beforeEach(() => {
    useGroupsPageStore.setState({ activeSport: 'all', selectedGroupId: null, selectedGroupSportId: null, activeGroupTab: 'posts' });
  });

  it('starts with "all" active sport and no group selected', () => {
    expect(useGroupsPageStore.getState().activeSport).toBe('all');
    expect(useGroupsPageStore.getState().selectedGroupId).toBeNull();
  });

  it('selectGroup sets the selected group and its sportId', () => {
    useGroupsPageStore.getState().selectGroup(42, 5);

    expect(useGroupsPageStore.getState().selectedGroupId).toBe(42);
    expect(useGroupsPageStore.getState().selectedGroupSportId).toBe(5);
  });

  it('selectGroup(null) clears both the group id and its sportId', () => {
    useGroupsPageStore.getState().selectGroup(42, 5);

    useGroupsPageStore.getState().selectGroup(null);

    expect(useGroupsPageStore.getState().selectedGroupId).toBeNull();
    expect(useGroupsPageStore.getState().selectedGroupSportId).toBeNull();
  });

  it('selectGroup(groupId, sportId) also switches the active sport pill to match', () => {
    useGroupsPageStore.getState().selectGroup(42, 5); // football

    expect(useGroupsPageStore.getState().activeSport).toBe('football');
  });

  it('selectGroup(null) ("All") leaves the active sport pill untouched', () => {
    useGroupsPageStore.getState().selectGroup(42, 6); // basketball
    useGroupsPageStore.getState().selectGroup(null);

    expect(useGroupsPageStore.getState().activeSport).toBe('basketball');
  });

  it('selectGroup with a sportId outside the known SportKeys leaves the active sport pill untouched', () => {
    useGroupsPageStore.getState().selectGroup(42, 999); // no SportKey mapping

    expect(useGroupsPageStore.getState().activeSport).toBe('all');
  });

  // 2026-07-25: activeSport/selectedGroupId are both this page's own state
  // now (no longer shared with Home Feed) — setActiveSport is a pure setter
  // and never touches the group selection on its own. GroupsPage.tsx decides
  // for itself whether a sport switch should also deselect the open group.
  it('setActiveSport never touches the selected group, regardless of which sport is picked', () => {
    useGroupsPageStore.getState().selectGroup(7, 5); // football group

    useGroupsPageStore.getState().setActiveSport('basketball');
    expect(useGroupsPageStore.getState().selectedGroupId).toBe(7);

    useGroupsPageStore.getState().setActiveSport('all');
    expect(useGroupsPageStore.getState().selectedGroupId).toBe(7);
    expect(useGroupsPageStore.getState().selectedGroupSportId).toBe(5);
  });
  // CLIENT-GROUP-SESSION-2 (owner, 2026-11-20): the group tab survives a reload.
  describe('the active group tab', () => {
    it('starts on Posts and is set by setActiveGroupTab', () => {
      expect(useGroupsPageStore.getState().activeGroupTab).toBe('posts');
      useGroupsPageStore.getState().setActiveGroupTab('sessions');
      expect(useGroupsPageStore.getState().activeGroupTab).toBe('sessions');
    });

    it('goes back to Posts whenever the selected group changes, including to "All"', () => {
      useGroupsPageStore.getState().selectGroup(42, 5);
      useGroupsPageStore.getState().setActiveGroupTab('members');
      useGroupsPageStore.getState().selectGroup(43, 5);
      expect(useGroupsPageStore.getState().activeGroupTab).toBe('posts');

      useGroupsPageStore.getState().setActiveGroupTab('chat');
      useGroupsPageStore.getState().selectGroup(null);
      expect(useGroupsPageStore.getState().activeGroupTab).toBe('posts');
    });

    it('is written to sessionStorage with the selected group', () => {
      useGroupsPageStore.getState().selectGroup(42, 5);
      useGroupsPageStore.getState().setActiveGroupTab('sessions');
      const stored = JSON.parse(sessionStorage.getItem('groups-page-storage') as string) as { state: Record<string, unknown> };
      expect(stored.state.activeGroupTab).toBe('sessions');
      expect(stored.state.selectedGroupId).toBe(42);
    });

    it('is restored on a reload (rehydration) without being reset by the restored group', async () => {
      sessionStorage.setItem(
        'groups-page-storage',
        JSON.stringify({ state: { activeSport: 'football', selectedGroupId: 42, selectedGroupSportId: 5, activeGroupTab: 'sessions' }, version: 0 }),
      );
      await useGroupsPageStore.persist.rehydrate();
      expect(useGroupsPageStore.getState().selectedGroupId).toBe(42);
      expect(useGroupsPageStore.getState().activeGroupTab).toBe('sessions');
    });

    it('falls back to Posts for a stored state that predates the tab', async () => {
      sessionStorage.setItem(
        'groups-page-storage',
        JSON.stringify({ state: { activeSport: 'all', selectedGroupId: 7, selectedGroupSportId: null }, version: 0 }),
      );
      await useGroupsPageStore.persist.rehydrate();
      expect(useGroupsPageStore.getState().selectedGroupId).toBe(7);
      expect(useGroupsPageStore.getState().activeGroupTab).toBe('posts');
    });
  });
});
