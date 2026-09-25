package com.sportconnect.reference.repository;

import com.sportconnect.reference.entity.Region;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface RegionRepository extends JpaRepository<Region, Long> {

    List<Region> findByCountryIdAndIsActiveTrueOrderByNameAsc(Long countryId);

    boolean existsByIdAndCountryIdAndIsActiveTrue(Long id, Long countryId);
}
