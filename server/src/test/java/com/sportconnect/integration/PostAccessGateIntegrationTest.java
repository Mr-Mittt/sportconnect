package com.sportconnect.integration;

import com.sportconnect.group.entity.Group;
import com.sportconnect.group.entity.GroupMember;
import com.sportconnect.group.repository.GroupMemberRepository;
import com.sportconnect.group.repository.GroupRepository;
import com.sportconnect.social.post.api.dto.CreateCommentRequest;
import com.sportconnect.social.post.api.dto.PostType;
import com.sportconnect.social.post.entity.Comment;
import com.sportconnect.social.post.entity.Post;
import com.sportconnect.social.post.repository.CommentLikeRepository;
import com.sportconnect.social.post.repository.CommentRepository;
import com.sportconnect.social.post.repository.PostLikeRepository;
import com.sportconnect.social.post.repository.PostRepository;
import com.sportconnect.user.entity.Friendship;
import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.FriendshipRepository;
import com.sportconnect.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Real end-to-end coverage for A14's {@code PostGate} (see
 * {@code modules/social/post-impl/docs/A14_POST_RESOURCE_GATE.md}) — every case here goes through
 * a real {@code MockMvc} HTTP request, real {@code PostController}/{@code PostServiceImpl}/
 * {@code CommentServiceImpl}/{@code PostGate}/{@code GroupServiceImpl}/{@code
 * UserFriendServiceImpl} beans, and a real H2-backed DB round trip — not mocked collaborators.
 * The Spock specs in {@code post-impl} (PostGateSpec, PostServiceImplSpec, CommentServiceImplSpec)
 * cover the gate's branch logic and the services' wiring to it with {@code PostGate} mocked out;
 * this class exists to prove the whole chain actually rejects/accepts over real HTTP.
 * <p>
 * Group/friendship fixtures are inserted directly via repositories rather than through {@code
 * GroupService.addMember} (which requires an existing friendship plus an invitation-acceptance
 * round trip, B9) or the friend-request flow — this class is testing {@code PostGate}'s read of
 * that state, not the group/friendship write paths themselves, which have their own coverage.
 */
class PostAccessGateIntegrationTest extends RedisBaseIT {

    private static final Integer ROLE_OWNER = 1;
    private static final Integer ROLE_MEMBER = 3;

    @Autowired
    private PostRepository postRepository;

    @Autowired
    private PostLikeRepository postLikeRepository;

    @Autowired
    private CommentRepository commentRepository;

    @Autowired
    private CommentLikeRepository commentLikeRepository;

    @Autowired
    private GroupRepository groupRepository;

    @Autowired
    private GroupMemberRepository groupMemberRepository;

    @Autowired
    private FriendshipRepository friendshipRepository;

    @Autowired
    private UserRepository userRepository;

    private UUID ownerId;
    private UUID memberId;
    private UUID outsiderId;
    private UUID friendId;

    @BeforeEach
    @Override
    public void baseSetup() {
        super.baseSetup();
        ownerId = createUser("owner").getId();
        memberId = createUser("member").getId();
        outsiderId = createUser("outsider").getId();
        friendId = createUser("friend").getId();
    }

    @AfterEach
    void cleanup() {
        commentLikeRepository.deleteAll();
        postLikeRepository.deleteAll();
        commentRepository.deleteAll();
        postRepository.deleteAll();
        friendshipRepository.deleteAll();
        groupMemberRepository.deleteAll();
        groupRepository.deleteAll();
        userRepository.deleteAll();
    }

    private User createUser(String label) {
        User user = new User();
        user.setUsername(label + "_" + UUID.randomUUID());
        user.setEmail(label + "_" + System.nanoTime() + "@example.com");
        user.setPasswordHash("password");
        user.setFirstName(label);
        user.setLastName("User");
        user.setIsEmailVerified(false);
        user.setIsActive(true);
        return userRepository.save(user);
    }

    private Group createGroup(boolean active) {
        Group group = Group.builder()
                .groupName("Test Group " + UUID.randomUUID())
                .createdBy(ownerId)
                .isPrivate(true)
                .isActive(active)
                .build();
        return groupRepository.save(group);
    }

    private void addMember(Long groupId, UUID userId, Integer roleId) {
        groupMemberRepository.save(GroupMember.builder()
                .groupId(groupId)
                .userId(userId)
                .roleId(roleId)
                .build());
    }

    private Post createPost(PostType type, Long groupId, UUID authorId, String visibility, boolean active) {
        Post post = Post.builder()
                .userId(authorId)
                .groupId(groupId)
                .postType(type)
                .content("content")
                .visibility(visibility)
                .isActive(active)
                .build();
        return postRepository.save(post);
    }

    private Comment createComment(Long postId, UUID authorId) {
        Comment comment = Comment.builder()
                .postId(postId)
                .userId(authorId)
                .content("a comment")
                .isActive(true)
                .build();
        return commentRepository.save(comment);
    }

    private Long groupPostFixture() {
        Group group = createGroup(true);
        addMember(group.getId(), ownerId, ROLE_OWNER);
        addMember(group.getId(), memberId, ROLE_MEMBER);
        return createPost(PostType.GROUP_POST, group.getId(), ownerId, "public", true).getId();
    }

    // ── getPostById ──────────────────────────────────────────────────────────

    @Test
    void getPostById_nonMemberOfGroupPost_returnsForbidden() throws Exception {
        Long postId = groupPostFixture();
        authenticateAs(outsiderId);

        mockMvc.perform(get("/api/posts/{postId}", postId))
                .andExpect(status().isForbidden());
    }

    @Test
    void getPostById_groupMember_returnsOk() throws Exception {
        Long postId = groupPostFixture();
        authenticateAs(memberId);

        mockMvc.perform(get("/api/posts/{postId}", postId))
                .andExpect(status().isOk());
    }

    @Test
    void getPostById_privateUserFeedPost_nonOwnerReturnsForbidden() throws Exception {
        Long postId = createPost(PostType.USER_FEED, null, ownerId, "private", true).getId();
        authenticateAs(outsiderId);

        mockMvc.perform(get("/api/posts/{postId}", postId))
                .andExpect(status().isForbidden());
    }

    @Test
    void getPostById_privateUserFeedPost_ownerReturnsOk() throws Exception {
        Long postId = createPost(PostType.USER_FEED, null, ownerId, "private", true).getId();
        authenticateAs(ownerId);

        mockMvc.perform(get("/api/posts/{postId}", postId))
                .andExpect(status().isOk());
    }

    @Test
    void getPostById_friendsVisibilityPost_friendReturnsOk() throws Exception {
        Long postId = createPost(PostType.USER_FEED, null, ownerId, "friends", true).getId();
        friendshipRepository.save(Friendship.builder().userId(ownerId).friendId(friendId).build());
        authenticateAs(friendId);

        mockMvc.perform(get("/api/posts/{postId}", postId))
                .andExpect(status().isOk());
    }

    @Test
    void getPostById_friendsVisibilityPost_nonFriendReturnsForbidden() throws Exception {
        Long postId = createPost(PostType.USER_FEED, null, ownerId, "friends", true).getId();
        authenticateAs(outsiderId);

        mockMvc.perform(get("/api/posts/{postId}", postId))
                .andExpect(status().isForbidden());
    }

    @Test
    void getPostById_softDeletedPost_returnsNotFound() throws Exception {
        Long postId = createPost(PostType.USER_FEED, null, ownerId, "public", false).getId();
        authenticateAs(ownerId);

        mockMvc.perform(get("/api/posts/{postId}", postId))
                .andExpect(status().isNotFound());
    }

    @Test
    void getPostById_postInSoftDeletedGroup_returnsNotFoundEvenForFormerOwner() throws Exception {
        Group group = createGroup(false); // B18: group already soft-deleted
        addMember(group.getId(), ownerId, ROLE_OWNER);
        Long postId = createPost(PostType.GROUP_POST, group.getId(), ownerId, "public", true).getId();
        authenticateAs(ownerId);

        mockMvc.perform(get("/api/posts/{postId}", postId))
                .andExpect(status().isNotFound());
    }

    // ── getPostComments ──────────────────────────────────────────────────────

    @Test
    void getPostComments_nonMemberOfGroupPost_returnsForbidden() throws Exception {
        Long postId = groupPostFixture();
        authenticateAs(outsiderId);

        mockMvc.perform(get("/api/posts/{postId}/comments", postId))
                .andExpect(status().isForbidden());
    }

    @Test
    void getPostComments_groupMember_returnsOk() throws Exception {
        Long postId = groupPostFixture();
        authenticateAs(memberId);

        mockMvc.perform(get("/api/posts/{postId}/comments", postId))
                .andExpect(status().isOk());
    }

    // ── createComment ────────────────────────────────────────────────────────

    @Test
    void createComment_nonMemberOfGroupPost_returnsForbidden() throws Exception {
        Long postId = groupPostFixture();
        authenticateAs(outsiderId);
        CreateCommentRequest request = CreateCommentRequest.builder().content("hi").build();

        mockMvc.perform(post("/api/posts/{postId}/comments", postId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(request)))
                .andExpect(status().isForbidden());
    }

    @Test
    void createComment_groupMember_returnsCreated() throws Exception {
        Long postId = groupPostFixture();
        authenticateAs(memberId);
        CreateCommentRequest request = CreateCommentRequest.builder().content("hi").build();

        mockMvc.perform(post("/api/posts/{postId}/comments", postId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(request)))
                .andExpect(status().isCreated());
    }

    // ── likePost / unlikePost ────────────────────────────────────────────────

    @Test
    void likePost_nonMemberOfGroupPost_returnsForbidden() throws Exception {
        Long postId = groupPostFixture();
        authenticateAs(outsiderId);

        mockMvc.perform(post("/api/posts/{postId}/like", postId))
                .andExpect(status().isForbidden());
    }

    @Test
    void likePost_groupMember_returnsOk() throws Exception {
        Long postId = groupPostFixture();
        authenticateAs(memberId);

        mockMvc.perform(post("/api/posts/{postId}/like", postId))
                .andExpect(status().isOk());
    }

    @Test
    void unlikePost_nonMemberOfGroupPost_returnsForbidden() throws Exception {
        Long postId = groupPostFixture();
        authenticateAs(outsiderId);

        mockMvc.perform(delete("/api/posts/{postId}/like", postId))
                .andExpect(status().isForbidden());
    }

    // ── likeComment / unlikeComment ──────────────────────────────────────────

    @Test
    void likeComment_nonMemberOfParentGroupPost_returnsForbidden() throws Exception {
        Long postId = groupPostFixture();
        Long commentId = createComment(postId, ownerId).getId();
        authenticateAs(outsiderId);

        mockMvc.perform(post("/api/posts/comments/{commentId}/like", commentId))
                .andExpect(status().isForbidden());
    }

    @Test
    void likeComment_groupMember_returnsOk() throws Exception {
        Long postId = groupPostFixture();
        Long commentId = createComment(postId, ownerId).getId();
        authenticateAs(memberId);

        mockMvc.perform(post("/api/posts/comments/{commentId}/like", commentId))
                .andExpect(status().isOk());
    }

    @Test
    void unlikeComment_nonMemberOfParentGroupPost_returnsForbidden() throws Exception {
        Long postId = groupPostFixture();
        Long commentId = createComment(postId, ownerId).getId();
        authenticateAs(outsiderId);

        mockMvc.perform(delete("/api/posts/comments/{commentId}/like", commentId))
                .andExpect(status().isForbidden());
    }

    @Test
    void unlikeComment_nonExistentComment_returnsNotFound() throws Exception {
        authenticateAs(ownerId);

        mockMvc.perform(delete("/api/posts/comments/{commentId}/like", 999_999L))
                .andExpect(status().isNotFound());
    }
}
