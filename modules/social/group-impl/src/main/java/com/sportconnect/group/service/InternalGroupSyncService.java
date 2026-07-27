package com.sportconnect.group.service;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.sportconnect.group.entity.GroupMember;
import com.sportconnect.group.entity.GroupRole;
import com.sportconnect.group.repository.GroupMemberRepository;
import com.sportconnect.group.repository.GroupRoleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Backs {@code InternalGroupSyncController}'s cold-start bootstrap endpoint for services/chat
 * (see services/chat/docs/SYNC_DESIGN.md). Deliberately not part of the public {@code
 * GroupService} {@code -api} contract — this is a sync concern for one specific consumer, not a
 * domain operation any other caller should depend on.
 */
@Service
@RequiredArgsConstructor
public class InternalGroupSyncService {

    private static final int MAX_LIMIT = 500;

    private final GroupMemberRepository groupMemberRepository;
    private final GroupRoleRepository groupRoleRepository;

    public record Row(
            @JsonProperty("group_id") Long groupId,
            @JsonProperty("user_id") String userId,
            @JsonProperty("role") String role) {
    }

    public record Page(
            @JsonProperty("items") List<Row> items,
            @JsonProperty("next_cursor") String nextCursor) {
    }

    public Page listGroupMembers(String cursor, int limit) {
        long afterId = (cursor == null || cursor.isBlank()) ? 0L : Long.parseLong(cursor);
        int pageSize = Math.min(limit, MAX_LIMIT);

        List<GroupMember> members = groupMemberRepository
                .findByIdGreaterThanOrderByIdAsc(afterId, PageRequest.of(0, pageSize));

        // Batch-resolve role names in one query regardless of how many distinct roles are in this
        // page — the same N+1 discipline every other paginated mapper in this app already meets.
        List<Integer> roleIds = members.stream()
                .map(GroupMember::getRoleId)
                .distinct()
                .collect(Collectors.toList());
        Map<Integer, String> roleNamesById = groupRoleRepository.findAllById(roleIds).stream()
                .collect(Collectors.toMap(GroupRole::getId, GroupRole::getRoleName));

        List<Row> items = members.stream()
                .map(m -> new Row(m.getGroupId(), m.getUserId().toString(), roleNamesById.get(m.getRoleId())))
                .collect(Collectors.toList());

        String nextCursor = members.size() < pageSize
                ? null
                : String.valueOf(members.get(members.size() - 1).getId());

        return new Page(items, nextCursor);
    }
}
