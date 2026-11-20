/**
 * A member's role in a group, as the server names it (`Group.currentUserRole`, `GroupMember.roleName`):
 * `'group_owner' | 'group_admin' | 'group_member'`. `Group.currentUserRole` is `null` for a caller who is not a member.
 */
export type GroupRole = 'group_owner' | 'group_admin' | 'group_member';

/**
 * "Can this role manage the group": the owner or an admin. The one place that spells the two role strings out, so a
 * check such as "may edit settings", "may see the join-request queue" or "may cancel a session of the group" reads the
 * same everywhere. Accepts the loose `string | null | undefined` the API types carry, and is `false` for a caller who
 * is not a member (`null`) and for anything it does not know.
 */
export function isGroupManager(role: string | null | undefined): boolean {
  return role === 'group_owner' || role === 'group_admin';
}
