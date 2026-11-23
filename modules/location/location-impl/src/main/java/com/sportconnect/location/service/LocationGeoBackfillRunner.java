package com.sportconnect.location.service;

import com.sportconnect.location.entity.Location;
import com.sportconnect.location.repository.LocationRepository;
import com.sportconnect.reference.api.dto.GeoMatch;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

/**
 * One-time (and re-runnable) backfill of {@code locations.country_id} / {@code region_id} for venues that have
 * coordinates but no country yet (LOC-5).
 *
 * <p>Flow: read a page of unlinked venues in ascending id after the last id seen, resolve each through
 * {@link LocationGeoResolver}, write the match with a guarded update, move on. Because the cursor is the id, every
 * venue is tried exactly once per run, so one that resolves to nothing (open ocean, an unseeded country) cannot loop;
 * it stays null and is tried again on the next start. The write is {@code ... WHERE country_id IS NULL}, so two
 * instances starting together set the same values and the loser changes nothing. The boundary index is built lazily
 * on the first lookup, so a start with nothing to backfill costs one query.
 *
 * <p>Runs on the main thread before the application serves traffic, bounded by the page size per query. A failure
 * of the whole run is logged and never stops start-up. Off with {@code app.location.geo-backfill.enabled=false}
 * (the test profile).
 */
@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "app.location.geo-backfill.enabled", havingValue = "true", matchIfMissing = true)
public class LocationGeoBackfillRunner implements ApplicationRunner {

    static final int PAGE_SIZE = 200;

    private final LocationRepository locationRepository;
    private final LocationGeoResolver locationGeoResolver;

    /** What one run did. */
    public record Result(int examined, int linked, int unresolved) {
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            Result result = backfill();
            if (result.examined() > 0) {
                log.info("Location geo backfill: examined {}, linked {}, left unresolved {}",
                        result.examined(), result.linked(), result.unresolved());
            }
        } catch (RuntimeException e) {
            log.error("Location geo backfill failed; venues keep their current country and region", e);
        }
    }

    /** Runs the backfill once over every venue that has coordinates and no country, and reports what it did. */
    public Result backfill() {
        long afterId = 0L;
        int examined = 0;
        int linked = 0;
        while (true) {
            List<Location> page = locationRepository.findGeoBackfillBatch(afterId, PageRequest.of(0, PAGE_SIZE));
            if (page.isEmpty()) {
                break;
            }
            for (Location venue : page) {
                examined++;
                Optional<GeoMatch> match = locationGeoResolver.resolve(
                        venue.getLocation().getY(), venue.getLocation().getX());
                if (match.isPresent()) {
                    Long regionId = match.get().getRegion() == null ? null : match.get().getRegion().getId();
                    linked += locationRepository.linkGeoIfUnset(venue.getId(), match.get().getCountry().getId(), regionId);
                }
                afterId = venue.getId();
            }
        }
        return new Result(examined, linked, examined - linked);
    }
}
