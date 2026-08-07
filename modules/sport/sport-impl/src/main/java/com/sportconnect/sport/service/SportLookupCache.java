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
 * Backs every read {@link SportServiceImpl} method with one cached master map of all sports
 * (including inactive — {@code getSportById} can return a soft-deleted sport, so the cache can't
 * be active-only) instead of independently caching each read method. A single cache entry avoids
 * {@code getSportsByIds}' {@code List<Long>} argument becoming part of a cache key (which would
 * otherwise create one cache entry per distinct id combination, and never be consistent with
 * {@code getSportById}'s own cache region) and guarantees all 4 read paths in
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

    /** No-arg method — Spring's default key generator produces a single, stable cache entry. */
    @Cacheable("sports")
    public Map<Long, Sport> getAllSportsById() {
        return sportRepository.findAll().stream()
                .collect(Collectors.toMap(Sport::getId, Function.identity()));
    }

    /** Called after every admin write (create/update/delete) so the next read repopulates fresh. */
    @CacheEvict(value = "sports", allEntries = true)
    public void evictAll() {
    }
}
