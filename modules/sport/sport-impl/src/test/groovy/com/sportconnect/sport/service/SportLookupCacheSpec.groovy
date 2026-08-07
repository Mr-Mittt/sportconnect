package com.sportconnect.sport.service

import com.sportconnect.sport.config.CacheConfig
import com.sportconnect.sport.entity.Sport
import com.sportconnect.sport.repository.SportRepository
import org.springframework.context.annotation.AnnotationConfigApplicationContext
import spock.lang.Specification

/**
 * A5: proves @Cacheable/@CacheEvict actually intercept calls to SportLookupCache — a plain
 * Mock()-based Spock spec never goes through the Spring AOP proxy that makes those annotations do
 * anything, so only a real Spring context can catch a missing @EnableCaching or a misconfigured
 * CacheManager. First Spring-context test in this module (every other spec here is a pure
 * Mock()-based unit spec) — built with a plain AnnotationConfigApplicationContext per test rather
 * than @SpringBootTest, so each test gets its own small, fully isolated context (no shared cache
 * state to worry about between tests) without depending on spock-spring's field-injection wiring.
 */
class SportLookupCacheSpec extends Specification {

    AnnotationConfigApplicationContext context

    def cleanup() {
        context?.close()
    }

    private SportLookupCache buildContext(SportRepository sportRepository) {
        context = new AnnotationConfigApplicationContext()
        context.registerBean(SportRepository, { sportRepository })
        context.register(CacheConfig, SportLookupCache)
        context.refresh()
        return context.getBean(SportLookupCache)
    }

    def "getAllSportsById caches its result across repeated calls"() {
        given:
        SportRepository sportRepository = Mock()
        def sportLookupCache = buildContext(sportRepository)
        def sports = [Sport.builder().id(1L).name("Football").isActive(true).build()]

        when:
        def first = sportLookupCache.getAllSportsById()
        def second = sportLookupCache.getAllSportsById()

        then:
        1 * sportRepository.findAll() >> sports
        first == second
        first[1L].name == "Football"
    }

    def "evictAll clears the cache so the next call hits the repository again"() {
        given:
        SportRepository sportRepository = Mock()
        def sportLookupCache = buildContext(sportRepository)
        def sports = [Sport.builder().id(1L).name("Football").isActive(true).build()]

        when:
        sportLookupCache.getAllSportsById()
        sportLookupCache.evictAll()
        sportLookupCache.getAllSportsById()

        then:
        2 * sportRepository.findAll() >> sports
    }
}
