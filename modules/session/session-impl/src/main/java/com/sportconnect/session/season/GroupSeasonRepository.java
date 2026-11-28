package com.sportconnect.session.season;

import com.sportconnect.session.api.dto.SeasonStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

/** SESSION-55: group seasons. */
public interface GroupSeasonRepository extends JpaRepository<GroupSeason, Long> {

    Optional<GroupSeason> findByIdAndGroupId(Long id, Long groupId);

    /** The group's seasons, newest start first, optionally narrowed to some statuses ({@code statuses} is never empty: the caller passes every one for "all"). */
    Page<GroupSeason> findByGroupIdAndStatusInOrderByStartAtDescIdDesc(Long groupId, Collection<SeasonStatus> statuses, Pageable pageable);

    long countByGroupIdAndStatusIn(Long groupId, Collection<SeasonStatus> statuses);

    /** Every season of the group that still holds its dates (not cancelled): the overlap check reads these. */
    List<GroupSeason> findByGroupIdAndStatusNot(Long groupId, SeasonStatus status);

    /** The seasons the status job looks at: the ones that can still change. Small by construction (two open per group, plus those waiting to finalise). */
    List<GroupSeason> findByStatusInOrderByIdAsc(Collection<SeasonStatus> statuses);

    /**
     * Takes the season's row lock for the rest of the transaction ({@code FOR UPDATE}), waiting if another holds it. It must run inside a
     * transaction (a lock taken in autocommit is released at once). A native query on purpose: the same SQL text runs on H2 and PostgreSQL.
     */
    @Query(value = "SELECT * FROM group_seasons WHERE id = :id FOR UPDATE", nativeQuery = true)
    Optional<GroupSeason> findByIdForUpdate(@Param("id") Long id);

    /** As {@link #findByIdForUpdate} but a season another transaction holds is skipped at once (empty), never waited for. */
    @Query(value = "SELECT * FROM group_seasons WHERE id = :id FOR UPDATE SKIP LOCKED", nativeQuery = true)
    Optional<GroupSeason> findByIdForUpdateSkipLocked(@Param("id") Long id);

    /**
     * Moves a season from one status to another only if it still has the first: one atomic compare-and-set, so two workers that both
     * decide on the same transition cannot both do it (the loser gets 0).
     */
    @Modifying
    @Query("UPDATE GroupSeason s SET s.status = :to, s.updatedAt = :now WHERE s.id = :id AND s.status = :from")
    int compareAndSetStatus(@Param("id") Long id, @Param("from") SeasonStatus from, @Param("to") SeasonStatus to, @Param("now") Instant now);

    @Modifying
    @Query("UPDATE GroupSeason s SET s.lastError = :error WHERE s.id = :id")
    int recordError(@Param("id") Long id, @Param("error") String error);
}
