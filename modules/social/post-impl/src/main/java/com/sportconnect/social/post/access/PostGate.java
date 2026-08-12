package com.sportconnect.social.post.access;

import com.sportconnect.common.access.ResourceGate;
import com.sportconnect.group.api.service.GroupService;
import com.sportconnect.social.post.entity.Post;
import com.sportconnect.user.api.service.UserFriendService;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * {@code post-impl}'s own {@link ResourceGate} implementation — see
 * {@code documentation/md/adr/RESOURCE_ACCESS_GATE_ADR.md} for the full design record. No other
 * domain touches this class; its cross-domain calls ({@link GroupService}, {@link
 * UserFriendService}) are both existing {@code post-impl} dependencies.
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
     * of 403ing as merely invisible.
     */
    @Override
    public boolean isAvailable(Post post) {
        if (post == null || !Boolean.TRUE.equals(post.getIsActive())) {
            return false;
        }
        return post.getGroupId() == null || groupService.isGroupActive(post.getGroupId());
    }

    /**
     * {@code USER_FEED} visibility follows {@code post.visibility}: the owner always sees their
     * own post; {@code public} is visible to anyone; {@code friends} requires an accepted
     * friendship (B1); anything else (including {@code private}) is owner-only. Every group-scoped
     * type ({@code GROUP_POST}/{@code GROUP_BROADCAST}/{@code GROUP_SYSTEM}) requires group
     * membership, same rule for all three.
     */
    @Override
    public boolean isVisibleTo(Post post, UUID viewerId) {
        return switch (post.getPostType()) {
            case USER_FEED -> isOwnerOrPublicOrFriend(post, viewerId);
            case GROUP_POST, GROUP_BROADCAST, GROUP_SYSTEM ->
                    viewerId != null && groupService.isGroupMember(post.getGroupId(), viewerId);
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
