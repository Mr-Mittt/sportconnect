package com.sportconnect.user.repository;

import com.sportconnect.user.entity.User;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Native implementation of {@link UserNameSearchRepository}. Native because the matching calls
 * {@code immutable_unaccent()} (V090) on the indexed expression; the H2 test schema declares the same function as an alias.
 * The SQL text is fixed apart from one clause per typed word, and every value is a bound parameter.
 */
public class UserNameSearchRepositoryImpl implements UserNameSearchRepository {

    /** The tie-break after the relevance CASE (or the whole order when the query has no words). */
    private static final String NAME_ORDER = " u.first_name, u.last_name, u.id";

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    public List<User> searchInScope(Collection<UUID> scopeIds, String query, int limit) {
        if (scopeIds == null || scopeIds.isEmpty() || limit <= 0) {
            return List.of();
        }
        UserNameSearch.Predicate predicate = UserNameSearch.predicate(query);
        String sql = "SELECT u.* FROM users u WHERE u.is_active = true AND u.id IN (:scopeIds) AND " + predicate.where()
                + orderBy(predicate);
        Query nativeQuery = entityManager.createNativeQuery(sql, User.class);
        nativeQuery.setParameter("scopeIds", scopeIds);
        bind(nativeQuery, predicate.params());
        nativeQuery.setMaxResults(limit);
        @SuppressWarnings("unchecked")
        List<User> users = nativeQuery.getResultList();
        return users;
    }

    @Override
    public Page<User> searchAll(UUID excludedUserId, String query, Pageable pageable) {
        UserNameSearch.Predicate predicate = UserNameSearch.predicate(query);
        String where = " WHERE u.is_active = true AND u.id <> :excludedUserId AND " + predicate.where();

        Query count = entityManager.createNativeQuery("SELECT COUNT(*) FROM users u" + where);
        count.setParameter("excludedUserId", excludedUserId);
        bind(count, predicate.params());
        long total = ((Number) count.getSingleResult()).longValue();

        Query page = entityManager.createNativeQuery("SELECT u.* FROM users u" + where + orderBy(predicate), User.class);
        page.setParameter("excludedUserId", excludedUserId);
        bind(page, predicate.params());
        page.setFirstResult((int) pageable.getOffset());
        page.setMaxResults(pageable.getPageSize());
        @SuppressWarnings("unchecked")
        List<User> users = page.getResultList();
        return new PageImpl<>(users, pageable, total);
    }

    private static String orderBy(UserNameSearch.Predicate predicate) {
        return " ORDER BY " + (predicate.first() == null ? "" : predicate.first() + ",") + NAME_ORDER;
    }

    private static void bind(Query query, Map<String, Object> params) {
        params.forEach(query::setParameter);
    }
}
