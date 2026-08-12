package com.sportconnect.social.post.access;

import com.sportconnect.common.access.ResourceGate;
import com.sportconnect.group.api.service.GroupService;
import com.sportconnect.social.post.api.dto.PostType;
import com.sportconnect.social.post.entity.Post;
import com.sportconnect.user.api.service.UserFriendService;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * {@code post-impl}'s own {@link ResourceGate} implementation — see
 * {@code documentation/md/adr/RESOURCE_ACCESS_GATE_ADR.md} for the full design record. No other
 * domain touches this class; its cross-domain calls ({@link GroupService}, {@link
 * UserFriendService}) are both existing {@code post-impl} dependencies. {@code post-impl} has no
 * dependency on {@code session-api} — SESSION-10/A17's {@code SESSION_POST} is deliberately
 * unconditionally unavailable through this gate (see {@link #isAvailable}); the only path to a
 * session's comment thread is {@code session-api}, one-way.
 */
@Component
@RequiredArgsConstructor
public class PostGate implements ResourceGate<Post> {

    private final GroupService groupService;
    private final UserFriendService userFriendService;

    /**
     * Existence/lifecycle only: not soft-deleted, and — if group-scoped — its parent group is
     * still active. Checked explicitly (rather than relying on {@code isGroupMember}'s own
     * internal active-group check, B18) so an inactive group's post 404s as unavailable instead
     * of 403ing as merely invisible. {@code SESSION_POST} is always unavailable here, regardless
     * of caller — SESSION-10/A17 deliberately keeps a session's comment-thread anchor invisible
     * via {@code /api/posts/**}; {@code session-api}'s own comment-proxy methods
     * (`SessionService.createSessionComment` etc.) are the only way to reach it, calling
     * {@code CommentService}'s bypass methods directly instead of going through this gate.
     */
    @Override
    public boolean isAvailable(Post post) {
        if (post == null || !Boolean.TRUE.equals(post.getIsActive())) {
            return false;
        }
        if (post.getPostType() == PostType.SESSION_POST) {
            return false;
        }
        return post.getGroupId() == null || groupService.isGroupActive(post.getGroupId());
    }

    /**
     * {@code USER_FEED} visibility follows {@code post.visibility}: the owner always sees their
     * own post; {@code public} is visible to anyone; {@code friends} requires an accepted
     * friendship (B1); anything else (including {@code private}) is owner-only. Every group-scoped
     * type ({@code GROUP_POST}/{@code GROUP_BROADCAST}/{@code GROUP_SYSTEM}) requires group
     * membership, same rule for all three. {@code SESSION_POST} is never reached in practice —
     * {@link #isAvailable} already returns {@code false} for it, so {@code ResourceGate.require()}
     * throws {@code NotFoundException} before this method is evaluated — but returns {@code false}
     * here too for safety, in case something ever calls {@code isVisibleTo} directly.
     */
    @Override
    public boolean isVisibleTo(Post post, UUID viewerId) {
        return switch (post.getPostType()) {
            case USER_FEED -> isOwnerOrPublicOrFriend(post, viewerId);
            case GROUP_POST, GROUP_BROADCAST, GROUP_SYSTEM ->
                    viewerId != null && groupService.isGroupMember(post.getGroupId(), viewerId);
            case SESSION_POST -> false;
        };
    }

    private boolean isOwnerOrPublicOrFriend(Post post, UUID viewerId) {
        if (viewerId != null && post.getUserId().equals(viewerId)) {
            return true;
        }
        String visibility = post.getVisibility();
        if ("public".equals(visibility)) {
            return true;
        }
        if ("friends".equals(visibility)) {
            return viewerId != null && userFriendService.areFriends(post.getUserId(), viewerId);
        }
        return false;
    }
}
