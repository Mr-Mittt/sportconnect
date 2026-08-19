package com.sportconnect.integration;

import com.sportconnect.session.api.dto.FeeType;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.dto.SessionType;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.repository.SessionParticipantRepository;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.social.post.api.dto.CommentType;
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
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Real end-to-end coverage for SESSION-21's system comments. Every case here goes through a real
 * {@code MockMvc} HTTP request, real {@code SessionController}/{@code SessionServiceImpl}/{@code
 * SessionGate}/{@code CommentServiceImpl} beans, and a real H2-backed DB round trip.
 * {@code SessionServiceImplSpec} and {@code CommentServiceImplSpec} cover the branch logic with
 * collaborators mocked out; this class exists to prove the parts only real wiring can show — that
 * a join through the real endpoint really does land a typed system row in the thread, that it
 * comes back through the existing comment-read path in the right order alongside real user
 * comments, and that the interaction guards map to real HTTP statuses through
 * {@code GlobalExceptionHandler}.
 * <p>
 * Fixtures are inserted via repositories rather than {@code POST /api/sessions} (which would pull
 * in location/sport validation this class isn't testing), following
 * {@code SessionPostAccessGateIntegrationTest}'s precedent — but the join, the comment writes, and
 * every assertion path go through real HTTP.
 * <p>
 * <b>One identity per test method.</b> {@code authenticateAs} only takes effect before the
 * <em>first</em> {@code MockMvc} request of a test method — every later request in that method
 * keeps running as that same principal, no matter how many times it's called again. Found the hard
 * way while writing this class: a mid-test switch back to the creator silently kept running as the
 * joiner, which made an earlier version of the ordering test below pass for the wrong reason. Any
 * case needing a second identity either gets its own test method, or builds the other user's row
 * as a fixture instead of over HTTP (see {@link #deleteComment_systemComment_isRejectedEvenForItsNominalAuthor}).
 */
class SessionSystemCommentIntegrationTest extends RedisBaseIT {

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
    private UserRepository userRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private UUID creatorId;
    private UUID joinerId;

    @BeforeEach
    @Override
    public void baseSetup() {
        super.baseSetup();
        creatorId = createUser("creator").getId();
        joinerId = createUser("Alice").getId();
    }

    @AfterEach
    void cleanup() {
        sessionParticipantRepository.deleteAll();
        sessionRepository.deleteAll();
        commentLikeRepository.deleteAll();
        commentRepository.deleteAll();
        postLikeRepository.deleteAll();
        postRepository.deleteAll();
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

    /** A standalone, auto-approving session, so a join through the real endpoint lands on JOINED. */
    private Long createAutoApproveSession(Long postId) {
        Session session = Session.builder()
                .groupId(null)
                .postId(postId)
                .sessionType(SessionType.STANDALONE)
                .createdBy(creatorId)
                .sportId(1L)
                .locationId(1L)
                .scheduledStart(LocalDateTime.now().plusDays(1))
                .status(SessionStatus.SCHEDULED)
                .capacity(9999)
                .feeType(FeeType.FREE)
                .initialSlot(0)
                .autoApprove(true)
                .build();
        return sessionRepository.save(session).getId();
    }

    /**
     * Forces a deterministic ordering gap. {@code Comment.createdAt} is {@code @CreationTimestamp}
     * and {@code updatable = false}, so it can't be backdated through the entity — and without a
     * gap, two comments written milliseconds apart could tie on a coarse clock and make the
     * ordering assertion flaky rather than meaningful. Uses {@code JdbcTemplate} rather than
     * {@code EntityManager} deliberately — the latter would need an active transaction that a
     * self-invoked {@code @Transactional} method in a test class doesn't get (no proxy).
     */
    private void backdate(Long commentId, int minutes) {
        jdbcTemplate.update(
                "UPDATE comments SET created_at = DATEADD('MINUTE', ?, created_at) WHERE id = ?",
                -minutes, commentId);
    }

    /**
     * Joins as {@code joinerId} through the real endpoint and returns the id of the single system
     * comment that join produced. Authenticates first — see the class Javadoc on why every request
     * in a test method runs as whoever was authenticated before the <em>first</em> one.
     */
    private Long joinAndGetSystemCommentId(Long sessionId, Long postId) throws Exception {
        authenticateAs(joinerId);
        mockMvc.perform(post("/api/sessions/{sessionId}/join", sessionId))
                .andExpect(status().isOk());

        List<Comment> systemComments = commentRepository.findAll().stream()
                .filter(comment -> comment.getPostId().equals(postId))
                .filter(comment -> comment.getCommentType() == CommentType.SESSION_SYSTEM)
                .toList();
        Assertions.assertEquals(1, systemComments.size(),
                "the join should have written exactly one system comment");
        return systemComments.get(0).getId();
    }

    // ── The write path: a real join lands a typed, creator-authored row ─────────

    @Test
    void joinSession_writesASystemCommentAuthoredBySessionCreator() throws Exception {
        Long postId = createSessionPostAnchor();
        Long sessionId = createAutoApproveSession(postId);

        Long systemCommentId = joinAndGetSystemCommentId(sessionId, postId);

        Comment systemComment = commentRepository.findById(systemCommentId).orElseThrow();
        // Authored by the session's creator, not the joiner it's about — B9's GROUP_SYSTEM rule.
        Assertions.assertEquals(creatorId, systemComment.getUserId());
        Assertions.assertEquals("Alice User joined the session", systemComment.getContent());
    }

    // ── The read path: ordering alongside real user comments ───────────────────

    @Test
    void getSessionComments_returnsSystemAndUserEntriesInChronologicalOrder() throws Exception {
        Long postId = createSessionPostAnchor();
        Long sessionId = createAutoApproveSession(postId);

        // The join first, so the system entry exists; then a real user comment on top of it.
        // Both requests run as the joiner — deliberately, not incidentally: re-authenticating
        // mid-test wouldn't actually switch identity (see the class Javadoc), so the author
        // contrast the assertions below rely on is real rather than an artifact.
        Long systemCommentId = joinAndGetSystemCommentId(sessionId, postId);

        String body = mockMvc.perform(post("/api/sessions/{sessionId}/comments", sessionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(CreateCommentRequest.builder().content("see you there").build())))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        Long userCommentId = objectMapper.readTree(body).path("data").path("id").asLong();

        // Push the system entry into the past so the expected order is unambiguous rather than a
        // coin-flip between two rows written milliseconds apart.
        backdate(systemCommentId, 5);

        // The joiner is JOINED after the join above, so SessionGate lets them read the thread.
        mockMvc.perform(get("/api/sessions/{sessionId}/comments", sessionId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(2))
                // newest first, matching the existing createdAt DESC read path
                .andExpect(jsonPath("$.data.content[0].id").value(userCommentId))
                .andExpect(jsonPath("$.data.content[0].commentType").value("USER"))
                .andExpect(jsonPath("$.data.content[0].content").value("see you there"))
                // a real user comment is authored by its actual writer...
                .andExpect(jsonPath("$.data.content[0].userId").value(joinerId.toString()))
                .andExpect(jsonPath("$.data.content[1].id").value(systemCommentId))
                .andExpect(jsonPath("$.data.content[1].commentType").value("SESSION_SYSTEM"))
                .andExpect(jsonPath("$.data.content[1].content").value("Alice User joined the session"))
                // ...while the system entry right beside it is authored by the session's creator,
                // even though it's about the joiner
                .andExpect(jsonPath("$.data.content[1].userId").value(creatorId.toString()));
    }

    // ── The interaction guards, over real HTTP ─────────────────────────────────

    @Test
    void deleteComment_systemComment_isRejectedEvenForItsNominalAuthor() throws Exception {
        Long postId = createSessionPostAnchor();
        // The system entry is built as a fixture rather than via a real join, so the delete below
        // can run as the creator — the row's own user_id, i.e. the one caller the ownership check
        // in deleteComment would otherwise wave through. A real join would have to run as the
        // joiner first, and that identity would then stick for the rest of the method.
        Comment systemComment = commentRepository.save(Comment.builder()
                .postId(postId)
                .userId(creatorId)
                .content("Alice User left the session")
                .commentType(CommentType.SESSION_SYSTEM)
                .isActive(true)
                .build());

        authenticateAs(creatorId);
        mockMvc.perform(delete("/api/posts/comments/{commentId}", systemComment.getId()))
                .andExpect(status().isBadRequest());

        Assertions.assertTrue(commentRepository.findById(systemComment.getId()).orElseThrow().getIsActive(),
                "the system entry should still be active after the rejected delete");
    }

    @Test
    void likeSessionComment_systemComment_isRejected() throws Exception {
        Long postId = createSessionPostAnchor();
        Long sessionId = createAutoApproveSession(postId);
        Long systemCommentId = joinAndGetSystemCommentId(sessionId, postId);

        // joinAndGetSystemCommentId leaves the joiner authenticated and JOINED — a caller who
        // passes SessionGate, so this proves the rejection is the system-entry guard, not access.
        mockMvc.perform(post("/api/sessions/{sessionId}/comments/{commentId}/like", sessionId, systemCommentId))
                .andExpect(status().isBadRequest());
    }

    @Test
    void createSessionComment_replyingToASystemComment_isRejected() throws Exception {
        Long postId = createSessionPostAnchor();
        Long sessionId = createAutoApproveSession(postId);
        Long systemCommentId = joinAndGetSystemCommentId(sessionId, postId);

        mockMvc.perform(post("/api/sessions/{sessionId}/comments", sessionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(CreateCommentRequest.builder()
                                .content("why?")
                                .parentCommentId(systemCommentId)
                                .build())))
                .andExpect(status().isBadRequest());
    }
}
