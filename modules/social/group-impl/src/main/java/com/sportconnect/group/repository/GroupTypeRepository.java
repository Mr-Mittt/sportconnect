package com.sportconnect.group.repository;

import com.sportconnect.group.entity.GroupType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface GroupTypeRepository extends JpaRepository<GroupType, Long> {

    Optional<GroupType> findByTypeName(String typeName);
}
