package com.sportconnect.group.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.io.Serializable;
import java.util.UUID;

/**
 * SESSION-81: the permanent number of one user in one group (V107). Unique per group, never reused, kept when the member
 * leaves ({@code group_members} rows are deleted on leave, this one is not). {@code groupId} is this module's own id; no
 * foreign key.
 */
@Entity
@Table(name = "group_member_numbers")
@IdClass(GroupMemberNumber.Key.class)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class GroupMemberNumber {

    @Id
    @Column(name = "group_id", nullable = false)
    private Long groupId;

    @Id
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "member_no", nullable = false)
    private Integer memberNo;

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @EqualsAndHashCode
    public static class Key implements Serializable {
        private Long groupId;
        private UUID userId;
    }
}
