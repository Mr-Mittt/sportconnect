package com.sportconnect.reference.repository;

import com.sportconnect.reference.entity.Country;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

@Repository
public interface CountryRepository extends JpaRepository<Country, Long> {

    List<Country> findByIsActiveTrueOrderByNameAsc();

    boolean existsByIdAndIsActiveTrue(Long id);

    /** REF-2: the active countries among a set of ISO alpha-2 codes — one query for all resolve candidates. */
    List<Country> findByIso2InAndIsActiveTrue(Collection<String> iso2Codes);
}
