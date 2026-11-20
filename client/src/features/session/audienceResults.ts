import type { GroupMemberSearchResult } from '@/features/feed/types';
import type { PickerMember } from '@/shared/components/MemberPicker';

/**
 * CLIENT-GROUP-SESSION-1: what the "Specific members" picker lists from a group member search (B23): the people found,
 * **without the caller** (the host is joined to their own session, so they are never an audience member), as the
 * picker's `{id, name, avatarUrl}`. Order is the server's.
 */
export function toAudienceResults(
  found: GroupMemberSearchResult[] | undefined,
  currentUserId: string | undefined,
): PickerMember[] {
  return (found ?? [])
    .filter((member) => member.userId !== currentUserId)
    .map((member) => ({ id: member.userId, name: member.fullName, avatarUrl: member.avatarUrl }));
}
