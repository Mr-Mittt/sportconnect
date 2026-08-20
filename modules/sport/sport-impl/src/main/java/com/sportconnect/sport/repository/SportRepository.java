package com.sportconnect.sport.repository;

import com.sportconnect.sport.entity.Sport;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SportRepository extends JpaRepository<Sport, Long> {

    Optional<Sport> findByName(String name);

    List<Sport> findByIsActiveTrue();

    List<Sport> findByCategory(String category);

    List<Sport> findByCategoryAndIsActiveTrue(String category);

    boolean existsByName(String name);

}
