package com.sportconnect.reference.repository;

import com.sportconnect.reference.entity.Language;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface LanguageRepository extends JpaRepository<Language, Long> {

    List<Language> findByIsActiveTrueOrderBySortOrderAscCodeAsc();

    boolean existsByCodeAndIsActiveTrue(String code);
}
