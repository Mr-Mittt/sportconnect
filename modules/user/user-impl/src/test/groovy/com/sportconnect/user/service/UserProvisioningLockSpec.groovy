package com.sportconnect.user.service

import jakarta.persistence.EntityManager
import org.hibernate.Session
import org.hibernate.jdbc.ReturningWork
import org.hibernate.jdbc.Work
import spock.lang.Specification
import spock.lang.Subject

import java.sql.Connection
import java.sql.DatabaseMetaData
import java.sql.PreparedStatement

class UserProvisioningLockSpec extends Specification {

    EntityManager entityManager = Mock()
    Session session = Mock()
    Connection connection = Mock()
    DatabaseMetaData metaData = Mock()
    PreparedStatement statement = Mock()

    @Subject
    UserProvisioningLock lock = new UserProvisioningLock()

    private final UUID sub = UUID.randomUUID()

    def setup() {
        lock.entityManager = entityManager
        entityManager.unwrap(Session) >> session
        connection.metaData >> metaData
        session.doReturningWork(_ as ReturningWork) >> { ReturningWork work -> work.execute(connection) }
        session.doWork(_ as Work) >> { Work work -> work.execute(connection) }
    }

    def "on PostgreSQL it takes the transaction advisory lock under the provisioning namespace and the subject's hash"() {
        when:
        lock.acquire(sub)

        then:
        1 * metaData.databaseProductName >> "PostgreSQL"
        1 * connection.prepareStatement("SELECT pg_advisory_xact_lock(?, hashtext(?))") >> statement
        1 * statement.setInt(1, 0x5C01)
        1 * statement.setString(2, sub.toString())
        1 * statement.execute()
        1 * statement.close()
    }

    def "on any other database it does nothing"() {
        when:
        lock.acquire(sub)

        then:
        1 * metaData.databaseProductName >> "H2"
        0 * connection.prepareStatement(_)
    }

    def "the database product is looked up once, not on every call"() {
        when:
        lock.acquire(sub)
        lock.acquire(UUID.randomUUID())
        lock.acquire(UUID.randomUUID())

        then:
        1 * metaData.databaseProductName >> "PostgreSQL"
        3 * connection.prepareStatement(_) >> statement
    }
}
