package com.sportconnect.session.api.service;

import com.sportconnect.session.api.dto.CreateSeasonRequest;
import com.sportconnect.session.api.dto.GroupMemberStatisticsResponse;
import com.sportconnect.session.api.dto.GroupStatisticsResponse;
import com.sportconnect.session.api.dto.SeasonDefaultsResponse;
import com.sportconnect.session.api.dto.SeasonLinkedSessionResponse;
import com.sportconnect.session.api.dto.SeasonLinksRequest;
import com.sportconnect.session.api.dto.SeasonResponse;
import com.sportconnect.session.api.dto.SeasonStatus;
import com.sportconnect.session.api.dto.UpdateSeasonRequest;
import com.sportconnect.social.post.api.dto.CommentResponse;
import com.sportconnect.social.post.api.dto.CreateCommentRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * SESSION-55: a group's seasons, periods of up to 31 days with their own statistics and board. Reads are for any member of an
 * active group; every write is for its owner and admins ({@code canManageMembers}). A missing or inactive group is
 * 404 {@code GROUP_NOT_FOUND}, a non-member 403 {@code SESSION_GROUP_MEMBER_REQUIRED}, a plain member on a write 403
 * {@code SESSION_GROUP_ADMIN_REQUIRED}, a season that is not this group's 404 {@code SESSION_SEASON_NOT_FOUND}. A change and the
 * group post that announces it are one transaction.
 */
public interface GroupSeasonService {

    /** What the create form pre-fills (the group's effective stat list and ranking rule, its timezone, today in it). Owner or admin. */
    SeasonDefaultsResponse getDefaults(Long groupId, UUID callerId);

    /**
     * Creates a season. Order of the refusals: permission, then the dates (400 {@code SESSION_SEASON_DATES_INVALID},
     * {@code SESSION_SEASON_START_IN_PAST}, {@code SESSION_SEASON_TOO_LONG}), the group's timezone (409
     * {@code SESSION_SEASON_TIMEZONE_MISSING}), the stat list and rule, then, under a lock on the group, the limit of two open
     * seasons (409 {@code SESSION_SEASON_LIMIT}) and the overlap with any season that is not cancelled (409
     * {@code SESSION_SEASON_OVERLAP}). Writes the season, its anchor post and the "created" announcement.
     */
    SeasonResponse create(Long groupId, UUID callerId, CreateSeasonRequest request);

    /** Edits a {@code SCHEDULED} season (409 {@code SESSION_SEASON_NOT_EDITABLE} otherwise, before any field); the same checks as create. */
    SeasonResponse update(Long groupId, Long seasonId, UUID callerId, UpdateSeasonRequest request);

    /** Cancels a {@code SCHEDULED} or {@code ONGOING} season (409 {@code SESSION_SEASON_NOT_CANCELLABLE} otherwise); it stays readable. */
    SeasonResponse cancel(Long groupId, Long seasonId, UUID callerId);

    /**
     * Finalises a {@code COMPLETED} season at once, without waiting for the guard (owner or admin; 409 {@code SESSION_SEASON_NOT_FINALISABLE}
     * otherwise): the sessions the engine has not counted yet are counted straight into the season (the engine still counts them into the players'
     * and the group's own rows later), then the season is {@code FINALISED}, frozen, and the group is told. Idempotent: a season the status job
     * finalised a moment ago answers 409 as any season that is no longer completed.
     */
    SeasonResponse finalise(Long groupId, Long seasonId, UUID callerId);

    /** One season with the like state of its anchor. Any member. */
    SeasonResponse get(Long groupId, Long seasonId, UUID callerId);

    /** The group's seasons, newest start first, optionally narrowed to some statuses (none = all). Any member. */
    Page<SeasonResponse> list(Long groupId, UUID callerId, Set<SeasonStatus> statuses, Pageable pageable);

    /** The sessions linked to a MANUAL season (an AUTO season has none), ordered by start. Any member. */
    List<SeasonLinkedSessionResponse> getLinks(Long groupId, Long seasonId, UUID callerId);

    /**
     * Links and unlinks sessions of a MANUAL season while it is {@code ONGOING} or {@code COMPLETED} (409
     * {@code SESSION_SEASON_LINKS_NOT_ALLOWED} for an AUTO season or any other status). A session to add must be a session of this
     * group whose local date, in the season's timezone, is within the season's dates (400 {@code SESSION_SEASON_SESSION_INVALID});
     * adding a linked session again and removing one that is not linked do nothing. At most 20 ids per list. Returns the links.
     */
    List<SeasonLinkedSessionResponse> updateLinks(Long groupId, Long seasonId, UUID callerId, SeasonLinksRequest request);

    /** The season's members' statistics: the same list the group's endpoint answers, through the season's own stat list. Any member. */
    GroupStatisticsResponse getStatistics(Long groupId, Long seasonId, UUID callerId, Pageable pageable);

    /** One member's detail in the season: the same shape as the group's member detail. Any member. */
    GroupMemberStatisticsResponse getMemberStatistics(Long groupId, Long seasonId, UUID callerId, UUID memberId, int page, int size);

    /** The season's discussion thread, gated like a session's (the season's group members). */
    Page<CommentResponse> getComments(Long groupId, Long seasonId, UUID callerId, Pageable pageable);

    CommentResponse createComment(Long groupId, Long seasonId, UUID callerId, CreateCommentRequest request);

    void likeComment(Long groupId, Long seasonId, Long commentId, UUID callerId);

    void unlikeComment(Long groupId, Long seasonId, Long commentId, UUID callerId);

    /** Likes the season itself (its anchor post). */
    void like(Long groupId, Long seasonId, UUID callerId);

    void unlike(Long groupId, Long seasonId, UUID callerId);
}
