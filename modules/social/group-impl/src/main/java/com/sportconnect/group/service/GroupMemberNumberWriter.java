package com.sportconnect.group.service;

import com.sportconnect.group.entity.GroupMemberNumber;
import com.sportconnect.group.entity.GroupMemberNumberCounter;
import com.sportconnect.group.repository.GroupMemberNumberCounterRepository;
import com.sportconnect.group.repository.GroupMemberNumberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import java.util.UUID;

/**
 * SESSION-81: the writes of {@link GroupMemberNumberServiceImpl}, each in a transaction of its own ({@code REQUIRES_NEW}, a
 * separate bean so the proxy applies): the allocation commits at once and its lock on the group's counter is held only for
 * its own few statements, never for the caller's longer transaction (the statistics engine's counting).
 */
@Component
@RequiredArgsConstructor
class GroupMemberNumberWriter {

    private final GroupMemberNumberRepository numberRepository;
    private final GroupMemberNumberCounterRepository counterRepository;

    /**
     * Creates the group's counter row when it has none. Two callers racing both try: the loser gets a duplicate-key error,
     * which the caller absorbs, and the winner's row is the one used.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    void ensureCounter(Long groupId) {
        if (!counterRepository.existsById(groupId)) {
            counterRepository.saveAndFlush(new GroupMemberNumberCounter(groupId, 0));
        }
    }

    /**
     * Gives a number to every one of these users that has none, under the group's counter lock, in a stable order (by user id),
     * and returns the number of every user asked for (also those another allocation numbered while this one waited for the
     * lock).
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    Map<UUID, Integer> allocateMissing(Long groupId, Collection<UUID> userIds) {
        GroupMemberNumberCounter counter = counterRepository.lockOne(groupId).orElseThrow();
        Map<UUID, Integer> result = new LinkedHashMap<>();
        numberRepository.findByGroupIdAndUserIdIn(groupId, userIds).forEach(n -> result.put(n.getUserId(), n.getMemberNo()));
        int next = Math.max(counter.getLastNo(), numberRepository.maxMemberNo(groupId));
        List<GroupMemberNumber> created = new ArrayList<>();
        TreeSet<UUID> ordered = new TreeSet<>(Comparator.comparing(UUID::toString));
        ordered.addAll(userIds);
        for (UUID user : ordered) {
            if (!result.containsKey(user)) {
                next++;
                created.add(new GroupMemberNumber(groupId, user, next));
                result.put(user, next);
            }
        }
        if (!created.isEmpty()) {
            numberRepository.saveAll(created);
            counter.setLastNo(next);
            counterRepository.save(counter);
        }
        return result;
    }
}
