package com.sportconnect.reference.repository;

import com.sportconnect.reference.entity.Region;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface RegionRepository extends JpaRepository<Region, Long> {

    List<Region> findByCountryIdAndIsActiveTrueOrderByNameAsc(Long countryId);

    boolean existsByIdAndCountryIdAndIsActiveTrue(Long id, Long countryId);

    /** REF-2: the active region with this ISO 3166-2 code (e.g. {@code VN-SG}). */
    Optional<Region> findByIsoCodeAndIsActiveTrue(String isoCode);
}
