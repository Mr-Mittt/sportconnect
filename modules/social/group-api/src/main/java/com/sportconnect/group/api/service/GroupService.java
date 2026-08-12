package com.sportconnect.group.api.service;

import com.sportconnect.group.api.dto.CreateGroupRequest;
import com.sportconnect.group.api.dto.CreateInvitationRequest;
import com.sportconnect.group.api.dto.CreateJoinRequestRequest;
import com.sportconnect.group.api.dto.GroupGeneralDataResponse;
import com.sportconnect.group.api.dto.GroupInfoResponse;
import com.sportconnect.group.api.dto.GroupInvitationResponse;
import com.sportconnect.group.api.dto.GroupMemberResponse;
import com.sportconnect.group.api.dto.GroupRecurrenceConfigResponse;
import com.sportconnect.group.api.dto.GroupRecurrenceResponse;
import com.sportconnect.group.api.dto.GroupResponse;
import com.sportconnect.group.api.dto.GroupSearchResponse;
import com.sportconnect.group.api.dto.GroupSettingsResponse;
import com.sportconnect.group.api.dto.JoinRequestResponse;
import com.sportconnect.group.api.dto.PinnedPostResponse;
import com.sportconnect.group.api.dto.UpdateGroupGeneralDataRequest;
import com.sportconnect.group.api.dto.UpdateGroupRecurrenceRequest;
import com.sportconnect.group.api.dto.UpdateGroupRequest;
import com.sportconnect.group.api.dto.UpdateGroupSettingsRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.UUID;

public interface GroupService {

    // Group CRUD Operations
    GroupResponse createGroup(UUID userId, CreateGroupRequest request);
    
    /**
     * Returns full group details, including the top-3 pinned posts. Public groups are visible to
     * any caller. Private groups are visible only to members (owner/admin/member) — a non-member
     * or {@code null} {@code currentUserId} gets a {@code BadRequestException} rather than the
     * group's details, so callers can't read a private group's content just by knowing its id.
     */
    GroupResponse getGroup(Long groupId, UUID currentUserId);
    
    /**
     * Returns the groups {@code userId} is a member of. Ordering is whatever {@code pageable}
     * requests (no default sort applied). Only active (non-deleted) groups are included — a
     * membership row left over from a since-deleted group is silently excluded rather than
     * surfaced as an error.
     */
    Page<GroupResponse> getUserGroups(UUID userId, Pageable pageable);
    
    /**
     * Searches public groups. {@code sportId} is the legacy single-sport filter (kept for
     * back-compat); {@code sportIds} is a newer multi-sport filter (A10) — when non-empty it
     * takes priority over {@code sportId} rather than the two being combined/ORed together.
     */
    Page<GroupSearchResponse> getPublicGroups(UUID currentUserId, Long sportId, List<Long> sportIds, String keyword, Pageable pageable);
    
    GroupResponse updateGroup(Long groupId, UUID userId, UpdateGroupRequest request);
    
    void deleteGroup(Long groupId, UUID userId);

    // Member Management

    /**
     * Owner/admin adds {@code targetUserId} to the group. Does NOT add them immediately (B9) —
     * creates a {@code GroupInvitation} at {@code pending_user} (self-approved by the caller) that
     * {@code targetUserId} must accept via {@link #acceptInvitation}, same as a peer-sent
     * invitation once approved. Still requires the caller and target to be friends, same gate as
     * {@link #createInvitation}. Always results in a {@code group_member} role on acceptance —
     * promote via {@link #updateMemberRole} afterward if a higher role is needed.
     */
    void addMember(Long groupId, UUID adminUserId, UUID targetUserId);
    
    void removeMember(Long groupId, UUID adminUserId, UUID targetUserId);
    
    void updateMemberRole(Long groupId, UUID adminUserId, UUID targetUserId, String newRoleName);
    
    Page<GroupMemberResponse> getGroupMembers(Long groupId, UUID currentUserId, Pageable pageable);
    
    void transferOwnership(Long groupId, UUID currentOwnerId, UUID newOwnerId);
    
    void leaveMember(Long groupId, UUID userId);

    // Join Request Management

    /**
     * Self-service request to join a group by name. B11: if the caller already has a
     * {@code pending_user} invitation for this group, this doesn't create an ordinary
     * pending row — it accepts that invitation directly (membership + welcome message) and returns
     * a {@code JoinRequestResponse} already at {@code status="accepted"}, with {@code reviewedBy}
     * attributed to whoever approved the invitation. Otherwise behaves as before: rejects if
     * already a member, if a pending request already exists, or if the group is at capacity.
     */
    JoinRequestResponse createJoinRequest(UUID userId, CreateJoinRequestRequest request);
    
    void acceptJoinRequest(Long requestId, UUID adminUserId);
    
    void declineJoinRequest(Long requestId, UUID adminUserId);
    
    Page<JoinRequestResponse> getGroupJoinRequests(Long groupId, UUID adminUserId, Pageable pageable);
    
    Page<JoinRequestResponse> getUserJoinRequests(UUID userId, Pageable pageable);

    void cancelJoinRequest(Long requestId, UUID callerId);

    // Group Info
    /**
     * Legacy path (backs {@code GET /{groupId}/info}), kept unchanged — reserved for a different
     * future purpose, not general data going forward (use {@link #getGroupGeneralData} for that).
     * Privacy-gated, same shape as {@link #getGroup}: a private group's info is visible in full
     * only to its members (owner/admin/member); a non-member (including a {@code null}
     * {@code currentUserId}) gets a stub response — {@code groupId}/{@code groupName}/
     * {@code isPrivate} only, every other field {@code null} — rather than a thrown exception, so
     * a caller can still show "this group is private" without a special-case error path. A public
     * group, or any member of a private one, gets every field populated.
     */
    GroupInfoResponse getGroupInfo(Long groupId, UUID currentUserId);

    /**
     * Canonical read path for "general data" (B19/GRP-9), matching {@link #updateGroupGeneralData}
     * — a separate DTO from {@link #getGroupInfo}/{@link GroupInfoResponse} even though the fields
     * currently line up 1:1, since the two paths are expected to diverge (see {@link #getGroupInfo}).
     * Same privacy gate as {@link #getGroupInfo}: full data for a public group or any member of a
     * private one; a {@code groupId}/{@code groupName}/{@code isPrivate}-only stub otherwise.
     */
    GroupGeneralDataResponse getGroupGeneralData(Long groupId, UUID currentUserId);

    /**
     * Owner or admin only (same permission model as {@link #updateGroup}), partial update.
     * Scoped write path for the "general data" fields {@link #getGroupGeneralData} reads back
     * (groupName/description/avatarUrl/coverUrl/rules/schedule) — a subset of what
     * {@link #updateGroup}/{@link UpdateGroupRequest} also accepts (isPrivate excluded; that stays
     * on the generic update-group endpoint as its own immediate-apply toggle). Kept as a separate
     * method/DTO rather than folded into {@link #updateGroup} so a caller editing only this data
     * doesn't need the wider {@link UpdateGroupRequest} shape.
     */
    GroupGeneralDataResponse updateGroupGeneralData(Long groupId, UUID userId, UpdateGroupGeneralDataRequest request);

    // Group Settings
    GroupSettingsResponse getGroupSettings(Long groupId, UUID userId);

    GroupSettingsResponse updateGroupSettings(Long groupId, UUID userId, UpdateGroupSettingsRequest request);

    // Recurring Session Schedule
    /** Member-read gate, mirroring getGroupSettings. */
    GroupRecurrenceResponse getGroupRecurrence(Long groupId, UUID userId);

    /**
     * Owner-write gate, mirroring updateGroupSettings. Validates (via LocationService) that
     * recurrenceLocationId's sport matches the group's sportId when a non-null locationId is
     * given — a BadRequestException otherwise. The session-generation job trusts an
     * already-validated recurrenceLocationId and never re-checks it.
     */
    GroupRecurrenceResponse updateGroupRecurrence(Long groupId, UUID userId, UpdateGroupRecurrenceRequest request);

    /**
     * Groups with GroupSettings.autoGenerateSessions=true and a complete recurrence rule.
     * Used exclusively by the session domain's scheduled generation job — never call this
     * per-row in a loop from elsewhere; it already does its own batch resolution internally.
     */
    List<GroupRecurrenceConfigResponse> getGroupsWithAutoGenerateSessionsEnabled();

    // Permission Checks
    /**
     * Existence/lifecycle only, no caller-identity component — true iff the group exists and is
     * not soft-deleted. Not exposed via a controller endpoint; its only intended callers are
     * same-JVM cross-domain {@code -api} consumers (e.g. a future {@code PostGate}/
     * {@code SessionGate}'s own {@code isAvailable()}) asking "is this resource's parent group
     * still active," independent of who's asking. {@link #isGroupOwner}/{@link #isGroupAdmin}/
     * {@link #isGroupMember} already call this internally, so callers checking role membership
     * don't need to call it separately first.
     */
    boolean isGroupActive(Long groupId);

    /** False for a non-existent groupId or a userId not owning it; also false if the group itself is soft-deleted (B18) — see {@link #isGroupActive}. */
    boolean isGroupOwner(Long groupId, UUID userId);

    /** False for a non-existent groupId or a userId not admining it; also false if the group itself is soft-deleted (B18) — see {@link #isGroupActive}. */
    boolean isGroupAdmin(Long groupId, UUID userId);

    /** False for a non-existent groupId or a userId not a member; also false if the group itself is soft-deleted (B18) — see {@link #isGroupActive}. */
    boolean isGroupMember(Long groupId, UUID userId);

    boolean canManageMembers(Long groupId, UUID userId);
    
    boolean canManagePosts(Long groupId, UUID userId);

    String getUserRoleInGroup(Long groupId, UUID userId);

    // Pinned Posts
    PinnedPostResponse pinPost(Long groupId, UUID userId, Long postId);

    void unpinPost(Long groupId, UUID userId, Long postId);

    List<PinnedPostResponse> getPinnedPosts(Long groupId, UUID currentUserId);

    // Feed helpers
    List<Long> getGroupIdsBySportProfiles(UUID userId);

    List<Long> getGroupIdsForMember(UUID userId);

    // Invitations

    /**
     * Member-initiated invitation. B11 rule 1: if {@code inviterId} is the group's owner or admin,
     * the invitation skips {@code pending_owner} entirely (no one else needs to approve their own
     * action) — it's created heading straight for {@code pending_user}, itself subject to rule 2
     * below. A regular member's invitation is unaffected — still created at {@code pending_owner}.
     * <p>
     * B14: if {@code inviteeId} already has an in-flight ({@code pending_owner}/{@code
     * pending_user}) invitation to this group, no second {@code GroupInvitation} row is created —
     * {@code inviterId} is instead recorded as an additional co-inviter on the existing row (see
     * {@code GroupInvitationResponse#getInviterFullNames()}), unless they're already recorded. If
     * they're newly added and are the group's owner/admin and the row is still
     * {@code pending_owner}, joining as a co-inviter auto-approves it toward {@code pending_user}
     * (or straight to {@code accepted} under B11 rule 2) — the same reasoning as this method's own
     * B11-rule-1 self-approval, applied to a co-invite instead of the original invite.
     */
    GroupInvitationResponse createInvitation(Long groupId, UUID inviterId, CreateInvitationRequest request);

    /**
     * Owner/admin approves a member-sent invitation. B11 rule 2: if the invitee already has a
     * {@code pending} join request for this group, this doesn't move the invitation to
     * {@code pending_user} — it accepts it directly (membership + welcome message crediting the
     * original inviter) and marks that join request {@code accepted} too, rather than leaving it
     * dangling {@code pending}.
     */
    void approveInvitation(Long invitationId, UUID ownerId);

    void declineInvitation(Long invitationId, UUID ownerId);

    void acceptInvitation(Long invitationId, UUID inviteeId);

    /**
     * Invitee rejects a {@code pending_user} invitation. {@code reason} (B13) is optional —
     * persisted as-is, including {@code null}, on {@link GroupInvitationResponse#getRejectReason()}.
     */
    void rejectInvitation(Long invitationId, UUID inviteeId, String reason);

    Page<GroupInvitationResponse> getGroupInvitations(Long groupId, UUID ownerId, Pageable pageable);

    /**
     * B13: owner/admin-only view of this group's {@code declined_by_user} invitations (with their
     * {@code rejectReason}), so an invitation's original inviter(s) — or anyone who can manage the
     * group — can see why a rejected invitee declined. Deliberately excludes
     * {@code declined_by_owner} rows: those never reached the invitee, so there's no rejection
     * reason to show for them.
     */
    Page<GroupInvitationResponse> getDeclinedInvitations(Long groupId, UUID ownerId, Pageable pageable);

    Page<GroupInvitationResponse> getUserPendingInvitations(UUID userId, Pageable pageable);

    /**
     * Returns invitations {@code inviterId} sent for this group that are still in flight —
     * {@code "pending_owner"} (awaiting owner/admin approval) or {@code "pending_user"} (approved,
     * awaiting the invitee's response) — both statuses in a single page, distinguishable via each
     * row's {@link GroupInvitationResponse#getStatus()}. Terminal statuses (accepted/declined_*)
     * are never included, since a caller paging through their own "still waiting on" list has no
     * use for them here. B14: matches against any recorded co-inviter for the invitation, not just
     * the row's original/first inviter — a member who joined an already-pending invitation as a
     * co-inviter sees it here too, not only the person who created the row.
     */
    Page<GroupInvitationResponse> getMemberSentInvitations(Long groupId, UUID inviterId, Pageable pageable);

    /**
     * B14: a co-inviter withdraws their own invite while the invitation is still
     * {@code pending_owner} — mirrors {@link #cancelJoinRequest(Long, UUID)}'s "requestor withdraws
     * their own in-flight item" shape (co-inviter check, status check), but only removes
     * {@code callerId}'s own {@code group_invitation_inviters} row rather than unconditionally
     * deleting the invitation. The invitation itself is deleted only once its last remaining
     * co-inviter withdraws — any other co-inviter can still act on it in the meantime. Once an
     * owner/admin has approved it ({@code pending_user}), it's out of every co-inviter's hands —
     * cancelling at that point isn't supported by this method, for any of them.
     */
    void cancelInvitation(Long invitationId, UUID callerId);
}
