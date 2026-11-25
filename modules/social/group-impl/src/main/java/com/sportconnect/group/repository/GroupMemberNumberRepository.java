package com.sportconnect.group.repository;

import com.sportconnect.group.entity.GroupMemberNumber;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

/** SESSION-81: the permanent member numbers of a group. */
public interface GroupMemberNumberRepository extends JpaRepository<GroupMemberNumber, GroupMemberNumber.Key> {

    List<GroupMemberNumber> findByGroupIdAndUserIdIn(Long groupId, Collection<UUID> userIds);

    List<GroupMemberNumber> findByGroupIdAndMemberNoIn(Long groupId, Collection<Integer> numbers);

    /** The highest number handed out in the group, 0 for none (a guard against a counter that fell behind). */
    @Query("SELECT COALESCE(MAX(n.memberNo), 0) FROM GroupMemberNumber n WHERE n.groupId = :groupId")
    int maxMemberNo(@Param("groupId") Long groupId);
}
