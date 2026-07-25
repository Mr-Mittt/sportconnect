import { beforeEach, describe, expect, it } from 'vitest';
import { useGroupsPageStore } from './groupsPageStore';

describe('groupsPageStore', () => {
  beforeEach(() => {
    useGroupsPageStore.setState({ activeSport: 'all', selectedGroupId: null, selectedGroupSportId: null });
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
});
