package com.sportconnect.session.repository;

import com.sportconnect.session.entity.GroupSessionRecurrenceMember;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface GroupSessionRecurrenceMemberRepository extends JpaRepository<GroupSessionRecurrenceMember, Long> {

    /** The chosen members of several recurrences in one query (the list endpoint never asks per recurrence). */
    List<GroupSessionRecurrenceMember> findByRecurrenceIdIn(Collection<Long> recurrenceIds);

    List<GroupSessionRecurrenceMember> findByRecurrenceId(Long recurrenceId);

    void deleteByRecurrenceId(Long recurrenceId);
}
