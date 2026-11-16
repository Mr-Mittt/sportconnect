package com.sportconnect.user.repository;

import com.sportconnect.user.entity.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

/**
 * SESSION-GL-64 — name searches over {@code users}, all built from {@link UserNameSearch} (the app's one rule). A Spring
 * Data fragment: {@link UserRepository} extends it and {@link UserNameSearchRepositoryImpl} supplies the native queries.
 * Only active users are ever returned.
 */
public interface UserNameSearchRepository {

    /**
     * The users of {@code scopeIds} whose name matches {@code query}, best match first (a name that begins with the first
     * typed word before one that only has a later word beginning with it, then first name, last name, id), at most
     * {@code limit}. A blank {@code query} matches every named user of the scope. An empty scope returns nothing.
     */
    List<User> searchInScope(Collection<UUID> scopeIds, String query, int limit);

    /**
     * The global search: active users other than {@code excludedUserId} whose name matches {@code query}, in the same
     * order, one page.
     */
    Page<User> searchAll(UUID excludedUserId, String query, Pageable pageable);
}
