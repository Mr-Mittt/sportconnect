import { beforeEach, describe, expect, it } from 'vitest';
import { useFeedSpaceStore } from './feedSpaceStore';

describe('feedSpaceStore', () => {
  beforeEach(() => {
    useFeedSpaceStore.setState({ activeSport: 'all', selectedGroupId: null });
  });

  it('starts with "all" active sport and no group selected', () => {
    expect(useFeedSpaceStore.getState().activeSport).toBe('all');
    expect(useFeedSpaceStore.getState().selectedGroupId).toBeNull();
  });

  it('selectGroup sets the selected group', () => {
    useFeedSpaceStore.getState().selectGroup(42);

    expect(useFeedSpaceStore.getState().selectedGroupId).toBe(42);
  });

  it('setActiveSport resets the selected group back to null', () => {
    useFeedSpaceStore.getState().selectGroup(42);

    useFeedSpaceStore.getState().setActiveSport('basketball');

    expect(useFeedSpaceStore.getState().activeSport).toBe('basketball');
    expect(useFeedSpaceStore.getState().selectedGroupId).toBeNull();
  });

  it('setActiveSport resets the group even when switching to the same sport', () => {
    useFeedSpaceStore.getState().setActiveSport('football');
    useFeedSpaceStore.getState().selectGroup(7);

    useFeedSpaceStore.getState().setActiveSport('football');

    expect(useFeedSpaceStore.getState().selectedGroupId).toBeNull();
  });
});
