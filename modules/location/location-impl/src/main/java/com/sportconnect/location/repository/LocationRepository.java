package com.sportconnect.location.repository;

import com.sportconnect.location.entity.Location;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface LocationRepository extends JpaRepository<Location, Long> {

    Page<Location> findBySportIdAndNameContainingIgnoreCase(Long sportId, String name, Pageable pageable);

    List<Location> findByIdIn(List<Long> ids);
}
