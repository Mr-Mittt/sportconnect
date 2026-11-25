package com.sportconnect.group.service

import com.sportconnect.group.entity.GroupMemberNumber
import com.sportconnect.group.entity.GroupMemberNumberCounter
import com.sportconnect.group.repository.GroupMemberNumberCounterRepository
import com.sportconnect.group.repository.GroupMemberNumberRepository
import org.springframework.dao.DataIntegrityViolationException
import spock.lang.Specification
import spock.lang.Subject

/**
 * SESSION-81: the permanent member numbers of a group. What is read is not allocated again, only the missing ones are
 * allocated (in a short transaction of their own), two callers racing to create the counter both end up with the winner's row,
 * and the allocation numbers in a stable order, continues after the last number handed out, and never reuses one.
 */
class GroupMemberNumberServiceImplSpec extends Specification {

    static final Long GROUP = 7L

    GroupMemberNumberRepository numberRepository = Mock()
    GroupMemberNumberCounterRepository counterRepository = Mock()
    GroupMemberNumberWriter writer = Mock()

    @Subject
    GroupMemberNumberServiceImpl service = new GroupMemberNumberServiceImpl(numberRepository, writer)

    UUID a = UUID.fromString('00000000-0000-0000-0000-00000000000a')
    UUID b = UUID.fromString('00000000-0000-0000-0000-00000000000b')
    UUID c = UUID.fromString('00000000-0000-0000-0000-00000000000c')

    def "users that already have a number are read, never allocated again"() {
        when:
        def result = service.getMemberNumbers(GROUP, [a, b])

        then:
        1 * numberRepository.findByGroupIdAndUserIdIn(GROUP, { it as Set == [a, b] as Set }) >> [
                new GroupMemberNumber(GROUP, a, 1), new GroupMemberNumber(GROUP, b, 2)]
        0 * writer._
        result == [(a): 1, (b): 2]
    }

    def "only the missing users are allocated, after the counter row is ensured, and the answer holds everyone asked for"() {
        when:
        def result = service.getMemberNumbers(GROUP, [a, b, c, a])

        then:
        1 * numberRepository.findByGroupIdAndUserIdIn(GROUP, { it as Set == [a, b, c] as Set }) >> [new GroupMemberNumber(GROUP, a, 4)]
        1 * writer.ensureCounter(GROUP)
        1 * writer.allocateMissing(GROUP, { it as Set == [b, c] as Set }) >> [(b): 5, (c): 6]
        result == [(a): 4, (b): 5, (c): 6]
    }

    def "a counter created by a caller that won the race is absorbed and the allocation goes on"() {
        when:
        def result = service.getMemberNumbers(GROUP, [a])

        then:
        1 * numberRepository.findByGroupIdAndUserIdIn(GROUP, _) >> []
        1 * writer.ensureCounter(GROUP) >> { throw new DataIntegrityViolationException('duplicate key') }
        1 * writer.allocateMissing(GROUP, [a]) >> [(a): 1]
        result == [(a): 1]
    }

    def "nothing asked means nothing read and nothing allocated"() {
        expect:
        service.getMemberNumbers(GROUP, []) == [:]
        service.getMemberNumbers(GROUP, null) == [:]
        service.getUserIdsByMemberNumbers(GROUP, []) == [:]
        service.getUserIdsByMemberNumbers(GROUP, null) == [:]
    }

    def "the user behind a number is looked up in one batch, and a number nobody has is absent"() {
        when:
        def result = service.getUserIdsByMemberNumbers(GROUP, [1, 2, 99, 1])

        then:
        1 * numberRepository.findByGroupIdAndMemberNoIn(GROUP, { it as Set == [1, 2, 99] as Set }) >> [
                new GroupMemberNumber(GROUP, a, 1), new GroupMemberNumber(GROUP, b, 2)]
        result == [(1): a, (2): b]
    }

    // ---- the writer -------------------------------------------------------------------------------------------------

    @Subject
    GroupMemberNumberWriter realWriter = new GroupMemberNumberWriter(numberRepository, counterRepository)

    def "the writer numbers the missing users in user id order, after the last number, and moves the counter"() {
        given:
        def counter = new GroupMemberNumberCounter(GROUP, 3)

        when:
        def result = realWriter.allocateMissing(GROUP, [c, a, b])

        then:
        1 * counterRepository.lockOne(GROUP) >> Optional.of(counter)
        1 * numberRepository.findByGroupIdAndUserIdIn(GROUP, _) >> [new GroupMemberNumber(GROUP, b, 2)]      // numbered while this waited for the lock
        1 * numberRepository.maxMemberNo(GROUP) >> 3
        1 * numberRepository.saveAll({ saved -> saved*.memberNo == [4, 5] && saved*.userId == [a, c] })
        1 * counterRepository.save({ it.lastNo == 5 })
        result == [(b): 2, (a): 4, (c): 5]
    }

    def "the writer trusts the higher of the counter and the highest number stored, so a counter that fell behind never reuses a number"() {
        given:
        def counter = new GroupMemberNumberCounter(GROUP, 1)

        when:
        def result = realWriter.allocateMissing(GROUP, [a])

        then:
        1 * counterRepository.lockOne(GROUP) >> Optional.of(counter)
        1 * numberRepository.findByGroupIdAndUserIdIn(GROUP, _) >> []
        1 * numberRepository.maxMemberNo(GROUP) >> 9
        1 * numberRepository.saveAll(_)
        1 * counterRepository.save({ it.lastNo == 10 })
        result == [(a): 10]
    }

    def "the writer writes nothing when everyone is already numbered"() {
        when:
        def result = realWriter.allocateMissing(GROUP, [a])

        then:
        1 * counterRepository.lockOne(GROUP) >> Optional.of(new GroupMemberNumberCounter(GROUP, 1))
        1 * numberRepository.findByGroupIdAndUserIdIn(GROUP, _) >> [new GroupMemberNumber(GROUP, a, 1)]
        1 * numberRepository.maxMemberNo(GROUP) >> 1
        0 * numberRepository.saveAll(_)
        0 * counterRepository.save(_)
        result == [(a): 1]
    }

    def "the writer creates the counter row only when there is none"() {
        when:
        realWriter.ensureCounter(GROUP)
        realWriter.ensureCounter(8L)

        then:
        1 * counterRepository.existsById(GROUP) >> false
        1 * counterRepository.saveAndFlush({ it.groupId == GROUP && it.lastNo == 0 })
        1 * counterRepository.existsById(8L) >> true
        0 * counterRepository.saveAndFlush({ it.groupId == 8L })
    }
}
