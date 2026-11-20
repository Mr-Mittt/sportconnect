import { describe, expect, it } from 'vitest';
import { isGroupManager } from './groupRole';

describe('isGroupManager', () => {
  it.each(['group_owner', 'group_admin'])('is true for %s', (role) => {
    expect(isGroupManager(role)).toBe(true);
  });

  it.each(['group_member', 'owner', 'ADMIN', '', 'something_else'])('is false for %s', (role) => {
    expect(isGroupManager(role)).toBe(false);
  });

  it('is false for a caller who is not a member', () => {
    expect(isGroupManager(null)).toBe(false);
    expect(isGroupManager(undefined)).toBe(false);
  });
});
