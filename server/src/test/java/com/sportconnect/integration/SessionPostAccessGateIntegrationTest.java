package com.sportconnect.integration;

import com.sportconnect.group.entity.Group;
import com.sportconnect.group.entity.GroupMember;
import com.sportconnect.group.repository.GroupMemberRepository;
import com.sportconnect.group.repository.GroupRepository;
import com.sportconnect.session.api.dto.FeeType;
import com.sportconnect.session.api.dto.ParticipantStatus;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.dto.SessionType;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.entity.SessionParticipant;
import com.sportconnect.session.repository.SessionParticipantRepository;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.social.post.api.dto.CreateCommentRequest;
import com.sportconnect.social.post.api.dto.PostType;
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

import java.time.LocalDateTime;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Real end-to-end coverage for SESSION-10/A17's one-way comment-thread design (see
 * {@code documentation/md/adr/RESOURCE_ACCESS_GATE_ADR.md} §7's supersession note) — every case
 * here goes through a real {@code MockMvc} HTTP request, real {@code SessionController}/{@code
 * SessionServiceImpl}/{@code SessionGate}/{@code PostController}/{@code PostGate}/{@code
 * CommentServiceImpl}/{@code GroupServiceImpl} beans, and a real H2-backed DB round trip. {@code
 * SessionGateSpec}, {@code SessionServiceImplSpec}, {@code PostGateSpec}, and {@code
 * CommentServiceImplSpec} (all in their respective module's Spock specs) cover the branch logic
 * with collaborators mocked out; this class exists to prove the whole chain — including that
 * {@code session-impl}'s one-way dependency on {@code post-api} actually wires up in a real Spring
 * context — rejects/accepts over real HTTP, and that a {@code SESSION_POST} really is unreachable
 * via {@code /api/posts/**}.
 * <p>
 * The {@code SESSION_POST} anchor and {@code Session}/{@code SessionParticipant} fixtures are
 * inserted directly via repositories rather than through {@code POST /api/sessions} (which would
 * pull in location/sport validation this class isn't testing) — this class is testing the gates'
 * read of that state, not the session-creation write path itself.
 */
class SessionPostAccessGateIntegrationTest extends RedisBaseIT {

    private static final Integer ROLE_OWNER = 1;
    private static final Integer ROLE_MEMBER = 3;

    @Autowired
    private PostRepository postRepository;

    @Autowired
    private CommentRepository commentRepository;

    @Autowired
    private CommentLikeRepository commentLikeRepository;

    @Autowired
    private PostLikeRepository postLikeRepository;

    @Autowired
    private SessionRepository sessionRepository;

    @Autowired
    private SessionParticipantRepository sessionParticipantRepository;

    @Autowired
    private GroupRepository groupRepository;

    @Autowired
    private GroupMemberRepository groupMemberRepository;

    @Autowired
    private UserRepository userRepository;

    private UUID creatorId;
    private UUID outsiderId;

    @BeforeEach
    @Override
    public void baseSetup() {
        super.baseSetup();
        creatorId = createUser("creator").getId();
        outsiderId = createUser("outsider").getId();
    }

    @AfterEach
    void cleanup() {
        sessionParticipantRepository.deleteAll();
        sessionRepository.deleteAll();
        commentLikeRepository.deleteAll();
        commentRepository.deleteAll();
        postLikeRepository.deleteAll();
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

    private Group createGroup(boolean active) {
        Group group = Group.builder()
                .groupName("Test Group " + UUID.randomUUID())
                .createdBy(creatorId)
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

    private Long createSessionPostAnchor() {
        Post post = Post.builder()
                .userId(creatorId)
                .groupId(null)
                .postType(PostType.SESSION_POST)
                .content("Session: fixture")
                .visibility("private")
                .isActive(true)
                .build();
        return postRepository.save(post).getId();
    }

    private Long createSession(Long groupId, Long postId) {
        Session session = Session.builder()
                .groupId(groupId)
                .postId(postId)
                .sessionType(groupId == null ? SessionType.STANDALONE : SessionType.GROUP_RECURRING)
                .createdBy(creatorId)
                .sportId(1L)
                .locationId(1L)
                .scheduledStart(LocalDateTime.now().plusDays(1))
                .status(SessionStatus.SCHEDULED)
                .capacity(9999)
                .feeType(FeeType.FREE)
                .initialSlot(0)
                .autoApprove(false)
                .build();
        return sessionRepository.save(session).getId();
    }

    private void addParticipant(Long sessionId, UUID userId, ParticipantStatus status) {
        sessionParticipantRepository.save(SessionParticipant.builder()
                .sessionId(sessionId)
                .userId(userId)
                .status(status)
                .build());
    }

    private Long createComment(Long postId, UUID authorId) {
        Comment comment = Comment.builder()
                .postId(postId)
                .userId(authorId)
                .content("a comment")
                .isActive(true)
                .build();
        return commentRepository.save(comment).getId();
    }

    // ── SESSION_POST is unreachable via /api/posts/** ───────────────────────────

    @Test
    void getPostById_sessionPost_returnsNotFoundEvenForTheCreatorParticipant() throws Exception {
        Long postId = createSessionPostAnchor();
        Long sessionId = createSession(null, postId);
        addParticipant(sessionId, creatorId, ParticipantStatus.JOINED);
        authenticateAs(creatorId);

        mockMvc.perform(get("/api/posts/{postId}", postId))
                .andExpect(status().isNotFound());
    }

    @Test
    void likePost_sessionPost_returnsNotFoundEvenForTheCreatorParticipant() throws Exception {
        Long postId = createSessionPostAnchor();
        Long sessionId = createSession(null, postId);
        addParticipant(sessionId, creatorId, ParticipantStatus.JOINED);
        authenticateAs(creatorId);

        mockMvc.perform(post("/api/posts/{postId}/like", postId))
                .andExpect(status().isNotFound());
    }

    @Test
    void getPostComments_sessionPost_returnsNotFoundEvenForTheCreatorParticipant() throws Exception {
        Long postId = createSessionPostAnchor();
        Long sessionId = createSession(null, postId);
        addParticipant(sessionId, creatorId, ParticipantStatus.JOINED);
        authenticateAs(creatorId);

        mockMvc.perform(get("/api/posts/{postId}/comments", postId))
                .andExpect(status().isNotFound());
    }

    @Test
    void createComment_sessionPost_returnsNotFoundEvenForTheCreatorParticipant() throws Exception {
        Long postId = createSessionPostAnchor();
        Long sessionId = createSession(null, postId);
        addParticipant(sessionId, creatorId, ParticipantStatus.JOINED);
        authenticateAs(creatorId);
        CreateCommentRequest request = CreateCommentRequest.builder().content("hi").build();

        mockMvc.perform(post("/api/posts/{postId}/comments", postId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(request)))
                .andExpect(status().isNotFound());
    }

    // ── GET/POST /api/sessions/{sessionId}/comments — standalone session ────────

    @Test
    void getSessionComments_joinedParticipant_returnsOk() throws Exception {
        Long postId = createSessionPostAnchor();
        Long sessionId = createSession(null, postId);
        addParticipant(sessionId, creatorId, ParticipantStatus.JOINED);
        authenticateAs(creatorId);

        mockMvc.perform(get("/api/sessions/{sessionId}/comments", sessionId))
                .andExpect(status().isOk());
    }

    @Test
    void getSessionComments_nonParticipant_returnsForbidden() throws Exception {
        Long postId = createSessionPostAnchor();
        Long sessionId = createSession(null, postId);
        addParticipant(sessionId, creatorId, ParticipantStatus.JOINED);
        authenticateAs(outsiderId);

        mockMvc.perform(get("/api/sessions/{sessionId}/comments", sessionId))
                .andExpect(status().isForbidden());
    }

    @Test
    void getSessionComments_leftParticipant_returnsForbidden() throws Exception {
        Long postId = createSessionPostAnchor();
        Long sessionId = createSession(null, postId);
        addParticipant(sessionId, outsiderId, ParticipantStatus.LEFT);
        authenticateAs(outsiderId);

        mockMvc.perform(get("/api/sessions/{sessionId}/comments", sessionId))
                .andExpect(status().isForbidden());
    }

    @Test
    void createSessionComment_joinedParticipant_returnsCreated() throws Exception {
        Long postId = createSessionPostAnchor();
        Long sessionId = createSession(null, postId);
        addParticipant(sessionId, creatorId, ParticipantStatus.JOINED);
        authenticateAs(creatorId);
        CreateCommentRequest request = CreateCommentRequest.builder().content("see you there").build();

        mockMvc.perform(post("/api/sessions/{sessionId}/comments", sessionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(request)))
                .andExpect(status().isCreated());
    }

    @Test
    void createSessionComment_nonParticipant_returnsForbidden() throws Exception {
        Long postId = createSessionPostAnchor();
        Long sessionId = createSession(null, postId);
        addParticipant(sessionId, creatorId, ParticipantStatus.JOINED);
        authenticateAs(outsiderId);
        CreateCommentRequest request = CreateCommentRequest.builder().content("can I join?").build();

        mockMvc.perform(post("/api/sessions/{sessionId}/comments", sessionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(request)))
                .andExpect(status().isForbidden());
    }

    @Test
    void getSessionComments_nonExistentSession_returnsNotFound() throws Exception {
        authenticateAs(creatorId);

        mockMvc.perform(get("/api/sessions/{sessionId}/comments", 999_999L))
                .andExpect(status().isNotFound());
    }

    // ── group-linked session — widened rule (ADR §6) ─────────────────────────────

    @Test
    void getSessionComments_groupMemberOfGroupLinkedSession_returnsOkEvenWithoutParticipantRow() throws Exception {
        Group group = createGroup(true);
        addMember(group.getId(), creatorId, ROLE_OWNER);
        addMember(group.getId(), outsiderId, ROLE_MEMBER);
        Long postId = createSessionPostAnchor();
        Long sessionId = createSession(group.getId(), postId);
        authenticateAs(outsiderId);

        mockMvc.perform(get("/api/sessions/{sessionId}/comments", sessionId))
                .andExpect(status().isOk());
    }

    @Test
    void getSessionComments_nonMemberNonParticipantOfGroupLinkedSession_returnsForbidden() throws Exception {
        Group group = createGroup(true);
        addMember(group.getId(), creatorId, ROLE_OWNER);
        Long postId = createSessionPostAnchor();
        Long sessionId = createSession(group.getId(), postId);
        authenticateAs(outsiderId);

        mockMvc.perform(get("/api/sessions/{sessionId}/comments", sessionId))
                .andExpect(status().isForbidden());
    }

    @Test
    void getSessionComments_groupLinkedSessionInSoftDeletedGroup_returnsNotFoundEvenForCreator() throws Exception {
        Group group = createGroup(false); // B18: group already soft-deleted
        addMember(group.getId(), creatorId, ROLE_OWNER);
        Long postId = createSessionPostAnchor();
        Long sessionId = createSession(group.getId(), postId);
        authenticateAs(creatorId);

        mockMvc.perform(get("/api/sessions/{sessionId}/comments", sessionId))
                .andExpect(status().isNotFound());
    }

    // ── like/unlike a session comment ───────────────────────────────────────────

    @Test
    void likeSessionComment_nonParticipant_returnsForbidden() throws Exception {
        Long postId = createSessionPostAnchor();
        Long sessionId = createSession(null, postId);
        addParticipant(sessionId, creatorId, ParticipantStatus.JOINED);
        Long commentId = createComment(postId, creatorId);
        authenticateAs(outsiderId);

        mockMvc.perform(post("/api/sessions/{sessionId}/comments/{commentId}/like", sessionId, commentId))
                .andExpect(status().isForbidden());
    }

    @Test
    void likeSessionComment_joinedParticipant_returnsOk() throws Exception {
        Long postId = createSessionPostAnchor();
        Long sessionId = createSession(null, postId);
        addParticipant(sessionId, creatorId, ParticipantStatus.JOINED);
        Long commentId = createComment(postId, creatorId);
        authenticateAs(creatorId);

        mockMvc.perform(post("/api/sessions/{sessionId}/comments/{commentId}/like", sessionId, commentId))
                .andExpect(status().isOk());
    }

    @Test
    void likeSessionComment_commentBelongsToADifferentSessionsPost_returnsNotFound() throws Exception {
        // Session A: caller is a legitimate JOINED participant here.
        Long postIdA = createSessionPostAnchor();
        Long sessionIdA = createSession(null, postIdA);
        addParticipant(sessionIdA, creatorId, ParticipantStatus.JOINED);

        // Session B: a completely different session/thread the caller has no access to.
        Long postIdB = createSessionPostAnchor();
        Long sessionIdB = createSession(null, postIdB);
        addParticipant(sessionIdB, outsiderId, ParticipantStatus.JOINED);
        Long commentIdOnB = createComment(postIdB, outsiderId);

        authenticateAs(creatorId);

        // Authorized against session A, but the commentId actually belongs to session B's thread.
        mockMvc.perform(post("/api/sessions/{sessionId}/comments/{commentId}/like", sessionIdA, commentIdOnB))
                .andExpect(status().isNotFound());
    }

    @Test
    void likeSessionComment_commentBelongsToAnUnrelatedNonSessionPost_returnsNotFound() throws Exception {
        Long postId = createSessionPostAnchor();
        Long sessionId = createSession(null, postId);
        addParticipant(sessionId, creatorId, ParticipantStatus.JOINED);

        // A comment on an ordinary USER_FEED post, nothing to do with any session.
        Post userFeedPost = Post.builder()
                .userId(outsiderId)
                .postType(PostType.USER_FEED)
                .content("unrelated")
                .visibility("private")
                .isActive(true)
                .build();
        Long unrelatedPostId = postRepository.save(userFeedPost).getId();
        Long unrelatedCommentId = createComment(unrelatedPostId, outsiderId);

        authenticateAs(creatorId);

        mockMvc.perform(post("/api/sessions/{sessionId}/comments/{commentId}/like", sessionId, unrelatedCommentId))
                .andExpect(status().isNotFound());
    }

    // ── like/unlike a session ────────────────────────────────────────────────────

    @Test
    void likeSession_joinedParticipant_returnsOk() throws Exception {
        Long postId = createSessionPostAnchor();
        Long sessionId = createSession(null, postId);
        addParticipant(sessionId, creatorId, ParticipantStatus.JOINED);
        authenticateAs(creatorId);

        mockMvc.perform(post("/api/sessions/{sessionId}/like", sessionId))
                .andExpect(status().isOk());
    }

    @Test
    void likeSession_nonParticipant_returnsForbidden() throws Exception {
        Long postId = createSessionPostAnchor();
        Long sessionId = createSession(null, postId);
        addParticipant(sessionId, creatorId, ParticipantStatus.JOINED);
        authenticateAs(outsiderId);

        mockMvc.perform(post("/api/sessions/{sessionId}/like", sessionId))
                .andExpect(status().isForbidden());
    }

    @Test
    void likeSession_groupMemberOfGroupLinkedSession_returnsOkEvenWithoutParticipantRow() throws Exception {
        Group group = createGroup(true);
        addMember(group.getId(), creatorId, ROLE_OWNER);
        addMember(group.getId(), outsiderId, ROLE_MEMBER);
        Long postId = createSessionPostAnchor();
        Long sessionId = createSession(group.getId(), postId);
        authenticateAs(outsiderId);

        mockMvc.perform(post("/api/sessions/{sessionId}/like", sessionId))
                .andExpect(status().isOk());
    }

    @Test
    void unlikeSession_afterLiking_returnsOk() throws Exception {
        Long postId = createSessionPostAnchor();
        Long sessionId = createSession(null, postId);
        addParticipant(sessionId, creatorId, ParticipantStatus.JOINED);
        authenticateAs(creatorId);

        mockMvc.perform(post("/api/sessions/{sessionId}/like", sessionId))
                .andExpect(status().isOk());
        mockMvc.perform(delete("/api/sessions/{sessionId}/like", sessionId))
                .andExpect(status().isOk());
    }

    @Test
    void unlikeSession_notCurrentlyLiked_returnsBadRequest() throws Exception {
        Long postId = createSessionPostAnchor();
        Long sessionId = createSession(null, postId);
        addParticipant(sessionId, creatorId, ParticipantStatus.JOINED);
        authenticateAs(creatorId);

        mockMvc.perform(delete("/api/sessions/{sessionId}/like", sessionId))
                .andExpect(status().isBadRequest());
    }
}
