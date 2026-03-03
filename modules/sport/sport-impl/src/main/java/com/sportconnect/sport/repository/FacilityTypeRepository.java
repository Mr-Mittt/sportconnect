package com.sportconnect.sport.repository;

import com.sportconnect.sport.entity.FacilityType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface FacilityTypeRepository extends JpaRepository<FacilityType, Long> {
    
    Optional<FacilityType> findByName(String name);
    
    boolean existsByName(String name);
}
