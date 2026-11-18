package com.sportconnect.session.repository;

import com.sportconnect.session.entity.SessionAudienceMember;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface SessionAudienceMemberRepository extends JpaRepository<SessionAudienceMember, Long> {

    /** The chosen members of a {@code SPECIFIC} audience: ids only, one query (no row is loaded). */
    @Query("SELECT m.userId FROM SessionAudienceMember m WHERE m.sessionId = :sessionId")
    List<UUID> findUserIdsBySessionId(@Param("sessionId") Long sessionId);
}
