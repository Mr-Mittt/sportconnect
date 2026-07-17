import { beforeEach, describe, expect, it } from 'vitest';
import { useFeedSpaceStore } from './feedSpaceStore';

describe('feedSpaceStore', () => {
  beforeEach(() => {
    useFeedSpaceStore.setState({ activeSport: 'all', selectedGroupId: null, selectedGroupSportId: null });
  });

  it('starts with "all" active sport and no group selected', () => {
    expect(useFeedSpaceStore.getState().activeSport).toBe('all');
    expect(useFeedSpaceStore.getState().selectedGroupId).toBeNull();
  });

  it('selectGroup sets the selected group and its sportId', () => {
    useFeedSpaceStore.getState().selectGroup(42, 5);

    expect(useFeedSpaceStore.getState().selectedGroupId).toBe(42);
    expect(useFeedSpaceStore.getState().selectedGroupSportId).toBe(5);
  });

  it('selectGroup(null) clears both the group id and its sportId', () => {
    useFeedSpaceStore.getState().selectGroup(42, 5);

    useFeedSpaceStore.getState().selectGroup(null);

    expect(useFeedSpaceStore.getState().selectedGroupId).toBeNull();
    expect(useFeedSpaceStore.getState().selectedGroupSportId).toBeNull();
  });

  it('setActiveSport resets the selected group when switching to an incompatible sport', () => {
    useFeedSpaceStore.getState().selectGroup(42, 5); // group belongs to sportId 5 (football)

    useFeedSpaceStore.getState().setActiveSport('basketball'); // sportId 6 — incompatible

    expect(useFeedSpaceStore.getState().activeSport).toBe('basketball');
    expect(useFeedSpaceStore.getState().selectedGroupId).toBeNull();
    expect(useFeedSpaceStore.getState().selectedGroupSportId).toBeNull();
  });

  it('setActiveSport keeps the selected group when switching to its own sport (bug found live)', () => {
    // Reproduces the reported bug: sport "All" + group "1st football"
    // selected -> switch sport to "Football" (the group's own sport) ->
    // switch back to "All". The group selection must survive both hops,
    // since it was never actually incompatible with either filter.
    useFeedSpaceStore.getState().selectGroup(7, 5); // group belongs to sportId 5 (football)

    useFeedSpaceStore.getState().setActiveSport('football');
    expect(useFeedSpaceStore.getState().selectedGroupId).toBe(7);

    useFeedSpaceStore.getState().setActiveSport('all');
    expect(useFeedSpaceStore.getState().selectedGroupId).toBe(7);
  });

  it('setActiveSport keeps the selected group when switching to "all" regardless of the group\'s sport', () => {
    useFeedSpaceStore.getState().selectGroup(7, 6); // basketball group

    useFeedSpaceStore.getState().setActiveSport('all');

    expect(useFeedSpaceStore.getState().selectedGroupId).toBe(7);
  });
});
