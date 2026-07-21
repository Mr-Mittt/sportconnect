package com.sportconnect.group.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "group_types")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GroupType {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "type_name", unique = true, nullable = false, length = 50)
    private String typeName;

    @Column(name = "max_members", nullable = false)
    private Integer maxMembers;

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof GroupType)) return false;
        GroupType groupType = (GroupType) o;
        return id != null && id.equals(groupType.getId());
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
