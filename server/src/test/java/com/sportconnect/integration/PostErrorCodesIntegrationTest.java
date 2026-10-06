package com.sportconnect.integration;

import com.sportconnect.group.entity.Group;
import com.sportconnect.group.entity.GroupMember;
import com.sportconnect.group.repository.GroupMemberRepository;
import com.sportconnect.group.repository.GroupRepository;
import com.sportconnect.social.post.api.dto.CommentType;
import com.sportconnect.social.post.api.dto.CreateCommentRequest;
import com.sportconnect.social.post.api.dto.CreatePostRequest;
import com.sportconnect.social.post.api.dto.PostType;
import com.sportconnect.social.post.api.dto.UpdateBroadcastEndTimeRequest;
import com.sportconnect.social.post.entity.Comment;
import com.sportconnect.social.post.entity.Post;
import com.sportconnect.social.post.repository.CommentLikeRepository;
import com.sportconnect.social.post.repository.CommentRepository;
import com.sportconnect.social.post.repository.PostLikeRepository;
import com.sportconnect.social.post.repository.PostRepository;
import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import java.time.LocalDateTime;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A18 — real-pipeline coverage of the post module's error codes: a real {@code MockMvc} request
 * through the real controller, {@code PostServiceImpl}/{@code CommentServiceImpl}/{@code PostGate}
 * and {@code GlobalExceptionHandler}, asserting the HTTP status and the {@code errorCode} (plus
 * {@code errorParams} where the code carries one). Fixtures are inserted through repositories, as
 * in {@link PostAccessGateIntegrationTest}.
 */
class PostErrorCodesIntegrationTest extends RedisBaseIT {

    private static final Integer ROLE_OWNER = 1;
    private static final Integer ROLE_MEMBER = 3;

    @Autowired private PostRepository postRepository;
    @Autowired private PostLikeRepository postLikeRepository;
    @Autowired private CommentRepository commentRepository;
    @Autowired private CommentLikeRepository commentLikeRepository;
    @Autowired private GroupRepository groupRepository;
    @Autowired private GroupMemberRepository groupMemberRepository;
    @Autowired private UserRepository userRepository;

    private UUID ownerId;
    private UUID memberId;
    private UUID outsiderId;
    private Long groupId;

    @BeforeEach
    @Override
    public void baseSetup() {
        super.baseSetup();
        ownerId = createUser("owner").getId();
        memberId = createUser("member").getId();
        outsiderId = createUser("outsider").getId();
        Group group = groupRepository.save(Group.builder()
                .groupName("Post Errors " + UUID.randomUUID())
                .createdBy(ownerId)
                .isPrivate(true)
                .isActive(true)
                .build());
        groupId = group.getId();
        addMember(groupId, ownerId, ROLE_OWNER);
        addMember(groupId, memberId, ROLE_MEMBER);
    }

    @AfterEach
    void cleanup() {
        commentLikeRepository.deleteAll();
        postLikeRepository.deleteAll();
        commentRepository.deleteAll();
        postRepository.deleteAll();
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

    private void addMember(Long gId, UUID userId, Integer roleId) {
        groupMemberRepository.save(GroupMember.builder().groupId(gId).userId(userId).roleId(roleId).build());
    }

    private Long seedPost(PostType type, Long gId, UUID authorId, String visibility, boolean active) {
        return postRepository.save(Post.builder()
                .userId(authorId).groupId(gId).postType(type).content("content")
                .visibility(visibility).isActive(active).build()).getId();
    }

    private Long seedPublicPost() {
        return seedPost(PostType.USER_FEED, null, ownerId, "public", true);
    }

    private Long seedComment(Long postId, UUID authorId, CommentType type) {
        return commentRepository.save(Comment.builder()
                .postId(postId).userId(authorId).content("a comment").commentType(type)
                .isActive(true).build()).getId();
    }

    private ResultActions createPost(CreatePostRequest request) throws Exception {
        return mockMvc.perform(post("/api/posts")
                .contentType(MediaType.APPLICATION_JSON)
                .content(toJson(request)));
    }

    private CreatePostRequest.CreatePostRequestBuilder body(PostType type) {
        return CreatePostRequest.builder().content("hello").postType(type);
    }

    // ── post gate: 404 / 403 ─────────────────────────────────────────────────

    @Test
    void getPost_thatDoesNotExist_is404PostNotFound() throws Exception {
        authenticateAs(ownerId);
        mockMvc.perform(get("/api/posts/{id}", 999999L))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("POST_NOT_FOUND"))
                .andExpect(jsonPath("$.message").value("Post not found"));
    }

    @Test
    void getPost_softDeleted_is404PostNotFound() throws Exception {
        Long postId = seedPost(PostType.USER_FEED, null, ownerId, "public", false);
        authenticateAs(ownerId);
        mockMvc.perform(get("/api/posts/{id}", postId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("POST_NOT_FOUND"));
    }

    @Test
    void getPost_groupPostAsOutsider_is403PostForbidden() throws Exception {
        Long postId = seedPost(PostType.GROUP_POST, groupId, ownerId, "public", true);
        authenticateAs(outsiderId);
        mockMvc.perform(get("/api/posts/{id}", postId))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("POST_FORBIDDEN"));
    }

    @Test
    void getPost_groupPostAsMember_is200() throws Exception {
        Long postId = seedPost(PostType.GROUP_POST, groupId, ownerId, "public", true);
        authenticateAs(memberId);
        mockMvc.perform(get("/api/posts/{id}", postId)).andExpect(status().isOk());
    }

    @Test
    void getGroupPosts_asNonMember_is403GroupMemberRequired() throws Exception {
        authenticateAs(outsiderId);
        mockMvc.perform(get("/api/posts/group/{id}", groupId))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("POST_GROUP_MEMBER_REQUIRED"));
    }

    // ── create ───────────────────────────────────────────────────────────────

    @Test
    void createPost_groupPostAsNonMember_is403GroupMemberRequired() throws Exception {
        authenticateAs(outsiderId);
        createPost(body(PostType.GROUP_POST).groupId(groupId).build())
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("POST_GROUP_MEMBER_REQUIRED"));
    }

    @Test
    void createPost_broadcastAsPlainMember_is403BroadcastAdminRequired() throws Exception {
        authenticateAs(memberId);
        createPost(body(PostType.GROUP_BROADCAST).groupId(groupId).build())
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("POST_BROADCAST_ADMIN_REQUIRED"));
    }

    @Test
    void createPost_broadcastAsOwner_isCreated() throws Exception {
        authenticateAs(ownerId);
        createPost(body(PostType.GROUP_BROADCAST).groupId(groupId).build())
                .andExpect(status().isCreated());
    }

    @Test
    void createPost_secondActiveBroadcast_is409BroadcastAlreadyActive() throws Exception {
        authenticateAs(ownerId);
        createPost(body(PostType.GROUP_BROADCAST).groupId(groupId).build()).andExpect(status().isCreated());
        createPost(body(PostType.GROUP_BROADCAST).groupId(groupId).build())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("POST_BROADCAST_ALREADY_ACTIVE"));
    }

    @Test
    void createPost_broadcastEndingInThePast_is400EndTimePast() throws Exception {
        authenticateAs(ownerId);
        createPost(body(PostType.GROUP_BROADCAST).groupId(groupId)
                .broadcastEndTime(LocalDateTime.now().minusHours(1)).build())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("POST_BROADCAST_END_TIME_PAST"));
    }

    @Test
    void createPost_userFeedWithAGroup_is400GroupNotAllowed() throws Exception {
        authenticateAs(ownerId);
        createPost(body(PostType.USER_FEED).groupId(groupId).build())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("POST_GROUP_NOT_ALLOWED"));
    }

    @Test
    void createPost_groupPostWithoutGroupId_is400GroupIdRequired() throws Exception {
        authenticateAs(ownerId);
        createPost(body(PostType.GROUP_POST).build())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("POST_GROUP_ID_REQUIRED"));
    }

    @Test
    void createPost_groupSystemType_is400TypeNotCreatableWithPostType() throws Exception {
        authenticateAs(ownerId);
        createPost(body(PostType.GROUP_SYSTEM).groupId(groupId).build())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("POST_TYPE_NOT_CREATABLE"))
                .andExpect(jsonPath("$.errorParams.postType").value("GROUP_SYSTEM"));
    }

    // ── update / delete / extend ─────────────────────────────────────────────

    @Test
    void updatePost_ofSomeoneElse_is403EditForbidden() throws Exception {
        Long postId = seedPublicPost();
        authenticateAs(outsiderId);
        mockMvc.perform(put("/api/posts/{id}", postId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(body(PostType.USER_FEED).build())))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("POST_EDIT_FORBIDDEN"));
    }

    @Test
    void updatePost_thatDoesNotExist_is404PostNotFound() throws Exception {
        authenticateAs(ownerId);
        mockMvc.perform(put("/api/posts/{id}", 999999L)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(body(PostType.USER_FEED).build())))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("POST_NOT_FOUND"));
    }

    @Test
    void updatePost_groupSystemPost_is400TypeNotEditable() throws Exception {
        Long postId = seedPost(PostType.GROUP_SYSTEM, groupId, ownerId, "public", true);
        authenticateAs(ownerId);
        mockMvc.perform(put("/api/posts/{id}", postId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(body(PostType.GROUP_POST).build())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("POST_TYPE_NOT_EDITABLE"))
                .andExpect(jsonPath("$.errorParams.postType").value("GROUP_SYSTEM"));
    }

    @Test
    void deletePost_ofSomeoneElse_is403DeleteForbidden() throws Exception {
        Long postId = seedPublicPost();
        authenticateAs(outsiderId);
        mockMvc.perform(delete("/api/posts/{id}", postId))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("POST_DELETE_FORBIDDEN"));
    }

    @Test
    void deletePost_ownPost_is200() throws Exception {
        Long postId = seedPublicPost();
        authenticateAs(ownerId);
        mockMvc.perform(delete("/api/posts/{id}", postId)).andExpect(status().isOk());
    }

    @Test
    void deletePost_groupSystemPost_is400TypeNotDeletable() throws Exception {
        Long postId = seedPost(PostType.GROUP_SYSTEM, groupId, ownerId, "public", true);
        authenticateAs(ownerId);
        mockMvc.perform(delete("/api/posts/{id}", postId))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("POST_TYPE_NOT_DELETABLE"));
    }

    private ResultActions extend(Long postId, LocalDateTime endTime) throws Exception {
        return mockMvc.perform(patch("/api/posts/{id}/broadcast-end-time", postId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(toJson(UpdateBroadcastEndTimeRequest.builder().broadcastEndTime(endTime).build())));
    }

    @Test
    void extendBroadcast_onANonBroadcastPost_is400NotBroadcast() throws Exception {
        Long postId = seedPublicPost();
        authenticateAs(ownerId);
        extend(postId, LocalDateTime.now().plusHours(2))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("POST_NOT_BROADCAST"));
    }

    @Test
    void extendBroadcast_asPlainMember_is403BroadcastAdminRequired() throws Exception {
        Long postId = seedPost(PostType.GROUP_BROADCAST, groupId, ownerId, "public", true);
        authenticateAs(memberId);
        extend(postId, LocalDateTime.now().plusHours(2))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("POST_BROADCAST_ADMIN_REQUIRED"));
    }

    @Test
    void extendBroadcast_withAPastEndTime_is400EndTimePast() throws Exception {
        Long postId = seedPost(PostType.GROUP_BROADCAST, groupId, ownerId, "public", true);
        authenticateAs(ownerId);
        extend(postId, LocalDateTime.now().minusHours(1))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("POST_BROADCAST_END_TIME_PAST"));
    }

    // ── post likes ───────────────────────────────────────────────────────────

    @Test
    void likePost_twice_is409AlreadyLiked() throws Exception {
        Long postId = seedPublicPost();
        authenticateAs(memberId);
        mockMvc.perform(post("/api/posts/{id}/like", postId)).andExpect(status().isOk());
        mockMvc.perform(post("/api/posts/{id}/like", postId))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("POST_ALREADY_LIKED"));
    }

    @Test
    void unlikePost_neverLiked_is409NotLiked() throws Exception {
        Long postId = seedPublicPost();
        authenticateAs(memberId);
        mockMvc.perform(delete("/api/posts/{id}/like", postId))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("POST_NOT_LIKED"));
    }

    @Test
    void likePost_thatDoesNotExist_is404PostNotFound() throws Exception {
        authenticateAs(memberId);
        mockMvc.perform(post("/api/posts/{id}/like", 999999L))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("POST_NOT_FOUND"));
    }

    // ── comments ─────────────────────────────────────────────────────────────

    private ResultActions comment(Long postId, Long parentId) throws Exception {
        return mockMvc.perform(post("/api/posts/{id}/comments", postId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(toJson(CreateCommentRequest.builder().content("hi").parentCommentId(parentId).build())));
    }

    @Test
    void createComment_onAPostTheCallerCannotSee_is403PostForbidden() throws Exception {
        Long postId = seedPost(PostType.GROUP_POST, groupId, ownerId, "public", true);
        authenticateAs(outsiderId);
        comment(postId, null)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("POST_FORBIDDEN"));
    }

    @Test
    void createComment_onAMissingPost_is404PostNotFound() throws Exception {
        authenticateAs(memberId);
        comment(999999L, null)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("POST_NOT_FOUND"));
    }

    @Test
    void createComment_replyToAMissingParent_is404ParentNotFound() throws Exception {
        Long postId = seedPublicPost();
        authenticateAs(memberId);
        comment(postId, 999999L)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("COMMENT_PARENT_NOT_FOUND"));
    }

    @Test
    void createComment_replyToASystemComment_is400SystemReadonlyReply() throws Exception {
        Long postId = seedPublicPost();
        Long systemId = seedComment(postId, ownerId, CommentType.SESSION_SYSTEM);
        authenticateAs(memberId);
        comment(postId, systemId)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("COMMENT_SYSTEM_READONLY"))
                .andExpect(jsonPath("$.errorParams.action").value("reply"));
    }

    @Test
    void deleteComment_ofSomeoneElse_is403DeleteForbidden() throws Exception {
        Long postId = seedPublicPost();
        Long commentId = seedComment(postId, ownerId, CommentType.USER);
        authenticateAs(memberId);
        mockMvc.perform(delete("/api/posts/comments/{id}", commentId))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("COMMENT_DELETE_FORBIDDEN"));
    }

    @Test
    void deleteComment_thatDoesNotExist_is404CommentNotFound() throws Exception {
        authenticateAs(memberId);
        mockMvc.perform(delete("/api/posts/comments/{id}", 999999L))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("COMMENT_NOT_FOUND"));
    }

    @Test
    void deleteComment_systemComment_is400SystemReadonlyDelete() throws Exception {
        Long postId = seedPublicPost();
        Long systemId = seedComment(postId, ownerId, CommentType.SESSION_SYSTEM);
        authenticateAs(ownerId);
        mockMvc.perform(delete("/api/posts/comments/{id}", systemId))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("COMMENT_SYSTEM_READONLY"))
                .andExpect(jsonPath("$.errorParams.action").value("delete"));
    }

    @Test
    void likeComment_systemComment_is400SystemReadonlyLike() throws Exception {
        Long postId = seedPublicPost();
        Long systemId = seedComment(postId, ownerId, CommentType.SESSION_SYSTEM);
        authenticateAs(memberId);
        mockMvc.perform(post("/api/posts/comments/{id}/like", systemId))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("COMMENT_SYSTEM_READONLY"))
                .andExpect(jsonPath("$.errorParams.action").value("like"));
    }

    @Test
    void likeComment_twice_is409AlreadyLiked() throws Exception {
        Long postId = seedPublicPost();
        Long commentId = seedComment(postId, ownerId, CommentType.USER);
        authenticateAs(memberId);
        mockMvc.perform(post("/api/posts/comments/{id}/like", commentId)).andExpect(status().isOk());
        mockMvc.perform(post("/api/posts/comments/{id}/like", commentId))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("COMMENT_ALREADY_LIKED"));
    }

    @Test
    void unlikeComment_neverLiked_is409NotLiked() throws Exception {
        Long postId = seedPublicPost();
        Long commentId = seedComment(postId, ownerId, CommentType.USER);
        authenticateAs(memberId);
        mockMvc.perform(delete("/api/posts/comments/{id}/like", commentId))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("COMMENT_NOT_LIKED"));
    }

    @Test
    void likeComment_thatDoesNotExist_is404CommentNotFound() throws Exception {
        authenticateAs(memberId);
        mockMvc.perform(post("/api/posts/comments/{id}/like", 999999L))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("COMMENT_NOT_FOUND"));
    }
}
