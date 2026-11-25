package com.sportconnect.group.api.service;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;

/**
 * SESSION-81 (owner, 2026-11-25): a small number for every member of a group, <b>unique inside the group, permanent and never
 * reused</b>. It belongs to the (group, user) pair, not to the {@code group_members} row, so a member who leaves and rejoins
 * gets the same number back. Other modules store it instead of the 36-character user id where a group's own data names its
 * members (the session module's group statistics and head-to-head), and translate back with {@link #getUserIdsByMemberNumbers}.
 * A number is allocated the first time it is asked for (members from before the feature were numbered in joined order by the
 * migration).
 */
public interface GroupMemberNumberService {

    /**
     * The number of each of these users in the group, allocating the missing ones (one short transaction of its own, so a caller
     * in a longer transaction does not hold the allocation's lock). The user is not checked to be a member: a user who left
     * keeps the number they had.
     *
     * @return one entry per distinct user id given
     */
    Map<UUID, Integer> getMemberNumbers(Long groupId, Collection<UUID> userIds);

    /**
     * The user id behind each of these numbers in the group (one batch query); a number nobody has is absent from the answer.
     */
    Map<Integer, UUID> getUserIdsByMemberNumbers(Long groupId, Collection<Integer> numbers);
}
