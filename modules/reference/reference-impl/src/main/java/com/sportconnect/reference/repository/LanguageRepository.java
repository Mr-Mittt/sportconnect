package com.sportconnect.reference.repository;

import com.sportconnect.reference.entity.Language;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface LanguageRepository extends JpaRepository<Language, Long> {

    List<Language> findByIsActiveTrueOrderBySortOrderAscCodeAsc();

    boolean existsByCodeAndIsActiveTrue(String code);

    /** REF-2: the active languages among a set of codes — one query for all locale candidates. */
    List<Language> findByCodeInAndIsActiveTrue(Collection<String> codes);

    /** REF-2: an active language by code, e.g. a country default. */
    Optional<Language> findByCodeAndIsActiveTrue(String code);
}
