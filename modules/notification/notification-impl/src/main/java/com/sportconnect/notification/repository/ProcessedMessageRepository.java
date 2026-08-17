package com.sportconnect.notification.repository;

import com.sportconnect.notification.entity.ProcessedMessage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProcessedMessageRepository extends JpaRepository<ProcessedMessage, String> {

    /**
     * Atomic dedup check-and-insert. Deliberately not a plain {@code save()} + catch
     * {@code DataIntegrityViolationException} — {@code messageId} has no {@code @GeneratedValue},
     * so Spring Data's default "is the id null?" new-entity check always says "not new" once it's
     * set, routing {@code save()} through {@code entityManager.merge()} (a silent select-then-
     * update, never throws on a duplicate) instead of {@code persist()}. Even working around that
     * (e.g. {@code Persistable.isNew()} forced {@code true}), catching the resulting
     * {@code DataIntegrityViolationException} inside a {@code @Transactional} method doesn't
     * actually let that transaction commit — JPA/Spring marks it rollback-only the instant the
     * low-level constraint violation occurs, independent of whether application code catches it;
     * the transaction then fails with {@code UnexpectedRollbackException} at commit regardless.
     * {@code ON CONFLICT DO NOTHING} sidesteps both problems entirely: it never throws, a
     * duplicate just returns {@code 0} affected rows. Caught by a real Postgres-backed
     * integration test, not by any Spock spec mocking this repository — neither the persist-vs-
     * merge distinction nor the rollback-only behavior is observable through a mock.
     *
     * @return {@code 1} if this message id was newly recorded, {@code 0} if already present
     */
    @Modifying
    @Query(value = "INSERT INTO processed_messages (message_id) VALUES (:messageId) ON CONFLICT DO NOTHING",
            nativeQuery = true)
    int insertIfAbsent(@Param("messageId") String messageId);
}
