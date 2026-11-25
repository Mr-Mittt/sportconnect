package com.sportconnect.group.service;

import com.sportconnect.group.api.service.GroupMemberNumberService;
import com.sportconnect.group.repository.GroupMemberNumberRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * SESSION-81: the permanent per-group member numbers. Reads join the caller's transaction (no lock); the numbers a user does
 * not have yet are allocated by {@link GroupMemberNumberWriter} in a short transaction of its own.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GroupMemberNumberServiceImpl implements GroupMemberNumberService {

    private final GroupMemberNumberRepository numberRepository;
    private final GroupMemberNumberWriter writer;

    @Override
    public Map<UUID, Integer> getMemberNumbers(Long groupId, Collection<UUID> userIds) {
        Map<UUID, Integer> result = new LinkedHashMap<>();
        if (userIds == null || userIds.isEmpty()) {
            return result;
        }
        Set<UUID> wanted = new LinkedHashSet<>(userIds);
        numberRepository.findByGroupIdAndUserIdIn(groupId, wanted).forEach(n -> result.put(n.getUserId(), n.getMemberNo()));
        List<UUID> missing = new ArrayList<>();
        for (UUID user : wanted) {
            if (!result.containsKey(user)) {
                missing.add(user);
            }
        }
        if (!missing.isEmpty()) {
            try {
                writer.ensureCounter(groupId);
            } catch (DataIntegrityViolationException e) {
                log.info("Member number counter race absorbed: group {}", groupId);
            }
            result.putAll(writer.allocateMissing(groupId, missing));
            log.info("Group {}: numbered {} member(s)", groupId, missing.size());
        }
        return result;
    }

    @Override
    public Map<Integer, UUID> getUserIdsByMemberNumbers(Long groupId, Collection<Integer> numbers) {
        Map<Integer, UUID> result = new LinkedHashMap<>();
        if (numbers == null || numbers.isEmpty()) {
            return result;
        }
        numberRepository.findByGroupIdAndMemberNoIn(groupId, new LinkedHashSet<>(numbers))
                .forEach(n -> result.put(n.getMemberNo(), n.getUserId()));
        return result;
    }
}
