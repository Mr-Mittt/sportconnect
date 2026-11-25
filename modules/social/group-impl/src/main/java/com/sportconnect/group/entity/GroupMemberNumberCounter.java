package com.sportconnect.group.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * SESSION-81: the last member number handed out in a group (V107). Allocating locks this row, so two allocations in one group
 * queue and never get the same number; it is a row of its own so the lock never touches the group itself.
 */
@Entity
@Table(name = "group_member_number_counters")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class GroupMemberNumberCounter {

    @Id
    @Column(name = "group_id", nullable = false)
    private Long groupId;

    @Column(name = "last_no", nullable = false)
    private Integer lastNo;
}
