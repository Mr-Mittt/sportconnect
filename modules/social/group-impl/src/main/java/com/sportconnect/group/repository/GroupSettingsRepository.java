package com.sportconnect.group.repository;

import com.sportconnect.group.entity.GroupSettings;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface GroupSettingsRepository extends JpaRepository<GroupSettings, Long> {

    Optional<GroupSettings> findByGroupId(Long groupId);

    boolean existsByGroupId(Long groupId);

    void deleteByGroupId(Long groupId);
}
