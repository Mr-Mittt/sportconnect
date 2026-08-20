package com.sportconnect.sport.service;

import com.sportconnect.sport.entity.Sport;
import com.sportconnect.sport.repository.SportRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Backs every user-facing read in {@link SportServiceImpl} with one cached map of the
 * <strong>active</strong> sports, instead of independently caching each read method.
 *
 * <p>Active-only is the point, not an optimisation: a deactivated sport disappears from the app
 * entirely — it cannot be fetched, cannot be tagged onto anything new, and anything already tagged
 * with it stops surfacing (A7). Caching only active rows makes that the default everywhere rather
 * than a filter each caller has to remember. This reverses the original A5 comment here, which said
 * the cache "can't be active-only" because {@code requireActiveSportById} had to return soft-deleted sports.
 * It no longer does; the one place that genuinely needs inactive rows is admin, and admin reads go
 * straight to {@code sportRepository} instead (see {@code SportServiceImpl.getAllSports},
 * {@code updateSport}, {@code deleteSport}) — deliberately bypassing this cache and never
 * populating it, since reactivating a sport is rare and not worth shaping the hot path around.
 *
 * <p>A single cache entry avoids
 * {@code getActiveSportsByIds}' {@code List<Long>} argument becoming part of a cache key (which would
 * otherwise create one cache entry per distinct id combination, and never be consistent with
 * {@code requireActiveSportById}'s own cache region) and guarantees all 4 read paths in
 * {@link SportServiceImpl} see identical data between writes.
 *
 * <p>Deliberately a separate bean from {@link SportServiceImpl} rather than a
 * {@code @Cacheable}-annotated method on it directly: {@code @Cacheable}/{@code @CacheEvict} are
 * Spring-AOP-proxy-based, so a same-class ({@code this.}) call would bypass the proxy and silently
 * never cache. Injecting this bean into {@code SportServiceImpl} instead means every call goes
 * through the real proxy.
 */
@Component
@RequiredArgsConstructor
class SportLookupCache {

    private final SportRepository sportRepository;

    /**
     * No-arg method — Spring's default key generator produces a single, stable cache entry.
     * Named for what it holds: <em>active</em> sports only, so a caller can't mistake it for the
     * full table the way {@code getAllSportsById} invited.
     */
    @Cacheable("sports")
    public Map<Long, Sport> getActiveSportsById() {
        return sportRepository.findByIsActiveTrue().stream()
                .collect(Collectors.toMap(Sport::getId, Function.identity()));
    }

    /** Called after every admin write (create/update/delete) so the next read repopulates fresh. */
    @CacheEvict(value = "sports", allEntries = true)
    public void evictAll() {
    }
}
