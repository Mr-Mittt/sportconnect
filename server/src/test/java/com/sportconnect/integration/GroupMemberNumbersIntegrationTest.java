package com.sportconnect.integration;

import com.sportconnect.group.api.service.GroupMemberNumberService;
import com.sportconnect.group.repository.GroupMemberNumberCounterRepository;
import com.sportconnect.group.repository.GroupMemberNumberRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * SESSION-81: the permanent per-group member numbers through the real Spring context and the real tables: allocation, the
 * same number on every later ask, numbers independent between groups, the reverse lookup, and two callers numbering at the
 * same time in one group (each gets a distinct number, none is skipped or given twice). The numbers belong to the (group, user)
 * pair, so a member who leaves and rejoins keeps theirs: there is no {@code group_members} row involved at all.
 *
 * <p>What this cannot prove: PostgreSQL's own {@code SELECT ... FOR UPDATE} on the counter row with two real instances, and
 * the migration's backfill (H2 has no migration).
 */
class GroupMemberNumbersIntegrationTest extends RedisBaseIT {

    private static final Long GROUP = 424_242L;
    private static final Long OTHER_GROUP = 424_243L;

    @Autowired private GroupMemberNumberService numbers;
    @Autowired private GroupMemberNumberRepository numberRepository;
    @Autowired private GroupMemberNumberCounterRepository counterRepository;

    @BeforeEach
    void clean() {
        numberRepository.deleteAll();
        counterRepository.deleteAll();
    }

    @AfterEach
    void cleanAfter() {
        clean();
    }

    @Test
    void numbersStartAtOneAreDistinctAndAreTheSameOnEveryLaterAsk() {
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        UUID c = UUID.randomUUID();

        Map<UUID, Integer> first = numbers.getMemberNumbers(GROUP, List.of(a, b, c));

        assertThat(first.values()).containsExactlyInAnyOrder(1, 2, 3);
        assertThat(numbers.getMemberNumbers(GROUP, List.of(c, a, b))).isEqualTo(first);
        assertThat(numbers.getMemberNumbers(GROUP, List.of(a))).containsEntry(a, first.get(a));
        assertThat(counterRepository.findById(GROUP).orElseThrow().getLastNo()).isEqualTo(3);
    }

    @Test
    void aLaterMemberContinuesAfterTheLastNumberAndNumbersAreNeverReused() {
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        numbers.getMemberNumbers(GROUP, List.of(a, b));

        UUID late = UUID.randomUUID();
        Map<UUID, Integer> later = numbers.getMemberNumbers(GROUP, List.of(late));

        assertThat(later).containsEntry(late, 3);
        // the member who "left" (nothing deletes a number) is asked for again and is still 1 or 2, never renumbered
        assertThat(numbers.getMemberNumbers(GROUP, List.of(a)).get(a)).isIn(1, 2);
    }

    @Test
    void aMemberWhoLeavesAndRejoinsGetsTheSameNumberBackAndNobodyTakesIt() {
        UUID leaver = UUID.randomUUID();
        int before = numbers.getMemberNumbers(GROUP, List.of(leaver)).get(leaver);
        // the group module deletes the group_members row on leave: the number table is not touched, so others cannot take it
        UUID newcomer = UUID.randomUUID();
        int newcomerNumber = numbers.getMemberNumbers(GROUP, List.of(newcomer)).get(newcomer);

        assertThat(newcomerNumber).isNotEqualTo(before);
        assertThat(numbers.getMemberNumbers(GROUP, List.of(leaver)).get(leaver)).isEqualTo(before);
    }

    @Test
    void groupsNumberTheirMembersIndependently() {
        UUID a = UUID.randomUUID();

        int inGroup = numbers.getMemberNumbers(GROUP, List.of(a)).get(a);
        int inOther = numbers.getMemberNumbers(OTHER_GROUP, List.of(a)).get(a);

        assertThat(inGroup).isEqualTo(1);
        assertThat(inOther).isEqualTo(1);          // the same user is number 1 in both, which are different numberings
        assertThat(numberRepository.count()).isEqualTo(2);
    }

    @Test
    void theUserBehindANumberIsLookedUpInOneBatchAndAnUnknownNumberIsAbsent() {
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        Map<UUID, Integer> given = numbers.getMemberNumbers(GROUP, List.of(a, b));

        Map<Integer, UUID> back = numbers.getUserIdsByMemberNumbers(GROUP, List.of(given.get(a), given.get(b), 99));

        assertThat(back).containsEntry(given.get(a), a).containsEntry(given.get(b), b).doesNotContainKey(99);
        assertThat(numbers.getUserIdsByMemberNumbers(OTHER_GROUP, List.of(given.get(a)))).isEmpty();   // numbers are per group
    }

    @Test
    void nothingAskedAllocatesNothing() {
        assertThat(numbers.getMemberNumbers(GROUP, List.of())).isEmpty();
        assertThat(numbers.getUserIdsByMemberNumbers(GROUP, List.of())).isEmpty();
        assertThat(numberRepository.count()).isZero();
        assertThat(counterRepository.count()).isZero();
    }

    @Test
    void callersNumberingAtTheSameTimeInOneGroupGetDistinctNumbersNoneSkippedNoneGivenTwice() throws Exception {
        int threads = 6;
        int perThread = 8;
        List<List<UUID>> sets = new ArrayList<>();
        UUID shared = UUID.randomUUID();                       // every caller also asks for one shared member
        for (int t = 0; t < threads; t++) {
            List<UUID> own = new ArrayList<>();
            own.add(shared);
            for (int i = 0; i < perThread; i++) {
                own.add(UUID.randomUUID());
            }
            sets.add(own);
        }
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        try {
            CyclicBarrier barrier = new CyclicBarrier(threads);
            List<Future<Map<UUID, Integer>>> futures = new ArrayList<>();
            for (List<UUID> own : sets) {
                futures.add(pool.submit(() -> {
                    barrier.await(10, TimeUnit.SECONDS);
                    return numbers.getMemberNumbers(GROUP, own);
                }));
            }
            Set<Integer> all = new HashSet<>();
            Integer sharedNumber = null;
            for (Future<Map<UUID, Integer>> future : futures) {
                Map<UUID, Integer> got = future.get(60, TimeUnit.SECONDS);
                assertThat(got).hasSize(perThread + 1);
                if (sharedNumber == null) {
                    sharedNumber = got.get(shared);
                }
                assertThat(got.get(shared)).as("everyone sees the shared member's one number").isEqualTo(sharedNumber);
                all.addAll(got.values());
            }
            int members = threads * perThread + 1;
            assertThat(all).hasSize(members);
            assertThat(new TreeSet<>(all)).containsExactlyElementsOf(java.util.stream.IntStream.rangeClosed(1, members).boxed().toList());
            assertThat(numberRepository.count()).isEqualTo(members);
            assertThat(counterRepository.findById(GROUP).orElseThrow().getLastNo()).isEqualTo(members);
        } finally {
            pool.shutdownNow();
        }
    }
}
