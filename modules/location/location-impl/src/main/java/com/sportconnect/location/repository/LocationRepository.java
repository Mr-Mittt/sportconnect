package com.sportconnect.location.repository;

import com.sportconnect.location.entity.Location;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

public interface LocationRepository extends JpaRepository<Location, Long> {

    Page<Location> findBySportIdAndNameContainingIgnoreCase(Long sportId, String name, Pageable pageable);

    List<Location> findByIdIn(List<Long> ids);

    /** LOC-5 backfill page: venues with coordinates and no country yet, ascending id, after {@code afterId}. */
    @Query("select l from Location l where l.location is not null and l.countryId is null and l.id > :afterId order by l.id")
    List<Location> findGeoBackfillBatch(@Param("afterId") Long afterId, Pageable pageable);

    /**
     * LOC-5: sets the country and region of one venue only while it still has no country. Guarded, so two instances
     * backfilling at once cannot overwrite each other, and it leaves {@code updated_at} alone (not an edit by anyone).
     *
     * @return 1 when linked, 0 when it already had a country
     */
    @Transactional
    @Modifying
    @Query("update Location l set l.countryId = :countryId, l.regionId = :regionId where l.id = :id and l.countryId is null")
    int linkGeoIfUnset(@Param("id") Long id, @Param("countryId") Long countryId, @Param("regionId") Long regionId);
}
