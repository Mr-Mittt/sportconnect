import { beforeEach, describe, expect, it } from 'vitest';
import { useFriendsPageStore } from './friendsPageStore';

describe('friendsPageStore', () => {
  beforeEach(() => {
    useFriendsPageStore.setState({ query: '', isAddMode: false, selectedPersonId: undefined });
  });

  it('starts with an empty query, not in Add mode, and no selection', () => {
    expect(useFriendsPageStore.getState().query).toBe('');
    expect(useFriendsPageStore.getState().isAddMode).toBe(false);
    expect(useFriendsPageStore.getState().selectedPersonId).toBeUndefined();
  });

  it('setQuery/setIsAddMode/setSelectedPersonId each update their own field independently', () => {
    useFriendsPageStore.getState().setQuery('priya');
    useFriendsPageStore.getState().setIsAddMode(true);
    useFriendsPageStore.getState().setSelectedPersonId('f1');

    expect(useFriendsPageStore.getState().query).toBe('priya');
    expect(useFriendsPageStore.getState().isAddMode).toBe(true);
    expect(useFriendsPageStore.getState().selectedPersonId).toBe('f1');
  });
});
