package com.sportconnect.group.repository;

import com.sportconnect.group.entity.GroupRole;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface GroupRoleRepository extends JpaRepository<GroupRole, Integer> {

    Optional<GroupRole> findByRoleName(String roleName);

    boolean existsByRoleName(String roleName);
}
