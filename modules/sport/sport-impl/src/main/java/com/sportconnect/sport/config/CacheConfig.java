package com.sportconnect.sport.config;

import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Enables Spring's caching abstraction for this module (A5) and provides the {@link CacheManager}
 * backing the {@code "sports"} cache — a single in-process {@link ConcurrentMapCacheManager}, no
 * TTL. Sport rows are effectively static at runtime (admin-only CRUD, a handful of rows total), and
 * {@code SportLookupCache} evicts the cache on every write, so a TTL safety net was judged
 * unnecessary for a write surface this small (see {@code modules/sport/sport-impl/docs/BACKLOG_MVP.md},
 * ticket A5).
 */
@Configuration
@EnableCaching
public class CacheConfig {

    @Bean
    public CacheManager cacheManager() {
        return new ConcurrentMapCacheManager("sports");
    }
}
