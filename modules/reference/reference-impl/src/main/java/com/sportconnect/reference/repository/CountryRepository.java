package com.sportconnect.reference.repository;

import com.sportconnect.reference.entity.Country;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CountryRepository extends JpaRepository<Country, Long> {

    List<Country> findByIsActiveTrueOrderByNameAsc();

    boolean existsByIdAndIsActiveTrue(Long id);
}
