package com.sportconnect.user.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.extern.slf4j.Slf4j;
import org.hibernate.Session;
import org.springframework.stereotype.Component;

import java.sql.PreparedStatement;
import java.util.UUID;

/**
 * A26: serialises the first sign-in of one identity-provider subject. Two concurrent callbacks for a new {@code sub}
 * both see no row; with this lock the second waits for the first to commit and then finds the row, instead of failing on
 * a unique constraint and retrying.
 *
 * <p>It is a transaction-scoped Postgres advisory lock ({@code pg_advisory_xact_lock(namespace, hashtext(sub))}): released
 * at commit or rollback, blocks only the same subject, and works across any number of backend instances. It is an
 * optimisation, not the guarantee -- the primary key and the email/phone unique indexes stay the arbiter, and the caller's
 * retry still covers a collision between two <em>different</em> subjects on one email or phone, which a per-{@code sub}
 * lock cannot see. On any other database (the H2 of the integration tests) it does nothing.
 *
 * <p>Advisory locks share one key space per database, so every use takes its own {@code namespace}. Registry:
 * {@link #NAMESPACE_USER_PROVISIONING} = {@code 0x5C01}. Never change a namespace once deployed: an old and a new instance
 * would stop excluding each other. The 32-bit {@code hashtext} can collide for two subjects; that only makes them wait for
 * each other briefly, it cannot produce a wrong result.
 */
@Slf4j
@Component
class UserProvisioningLock {

    /** Namespace (first key) of the user-provisioning lock; see the registry in the class comment. */
    static final int NAMESPACE_USER_PROVISIONING = 0x5C01;

    private static final String SQL = "SELECT pg_advisory_xact_lock(?, hashtext(?))";

    @PersistenceContext
    private EntityManager entityManager;

    private volatile Boolean postgres;

    /** Blocks until no other open transaction holds the lock for {@code subject}; held until the caller's transaction ends. Needs an active transaction. */
    void acquire(UUID subject) {
        Session session = entityManager.unwrap(Session.class);
        if (!isPostgres(session)) {
            return;
        }
        session.doWork(connection -> {
            try (PreparedStatement statement = connection.prepareStatement(SQL)) {
                statement.setInt(1, NAMESPACE_USER_PROVISIONING);
                statement.setString(2, subject.toString());
                statement.execute();
            }
        });
    }

    private boolean isPostgres(Session session) {
        Boolean known = postgres;
        if (known == null) {
            known = session.doReturningWork(connection ->
                    "PostgreSQL".equals(connection.getMetaData().getDatabaseProductName()));
            postgres = known;
            if (!known) {
                log.info("Provisioning lock disabled: the database is not PostgreSQL");
            }
        }
        return known;
    }
}
