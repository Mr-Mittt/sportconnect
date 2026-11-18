package com.sportconnect.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.sportconnect.group.entity.Group;
import com.sportconnect.group.entity.GroupMember;
import com.sportconnect.group.repository.GroupMemberRepository;
import com.sportconnect.group.repository.GroupRepository;
import com.sportconnect.session.api.dto.FeeType;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.dto.SessionType;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.social.post.api.dto.PostType;
import com.sportconnect.social.post.entity.Post;
import com.sportconnect.social.post.repository.CommentRepository;
import com.sportconnect.social.post.repository.PostRepository;
import com.sportconnect.sport.entity.Sport;
import com.sportconnect.sport.repository.SportRepository;
import com.sportconnect.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.CacheManager;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SESSION-GROUP-2 through the real pipeline: {@code GET /api/sessions/group/{groupId}?bucket=} returns one bucket of a
 * group's sessions (ONGOING, SCHEDULED, PREPARING, HISTORY = COMPLETED and CANCELLED) in a fixed order, for members only.
 */
class SessionGroupBucketIntegrationTest extends RedisBaseIT {

    private static final Integer OWNER_ROLE_ID = 1;
    private static final Integer MEMBER_ROLE_ID = 3;

    @Autowired private SessionRepository sessionRepository;
    @Autowired private GroupRepository groupRepository;
    @Autowired private GroupMemberRepository groupMemberRepository;
    @Autowired private PostRepository postRepository;
    @Autowired private CommentRepository commentRepository;
    @Autowired private SportRepository sportRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private CacheManager cacheManager;

    private UUID ownerId;
    private UUID memberId;
    private UUID outsiderId;
    private Long sportId;
    private Long groupId;
    private Long otherGroupId;
    private final Instant base = Instant.now().plusSeconds(10 * 86400);

    @BeforeEach
    void setUpFixtures() {
        clearAll();
        ownerId = createUserWithRoles(true, "USER");
        memberId = createUserWithRoles(true, "USER");
        outsiderId = createUserWithRoles(true, "USER");
        sportId = sportRepository.save(Sport.builder().name("SESSION-GROUP-2 " + UUID.randomUUID()).isActive(true).build()).getId();
        evictSportCache();
        groupId = groupRepository.save(Group.builder().groupName("SESSION-GROUP-2 " + UUID.randomUUID())
                .createdBy(ownerId).isPrivate(true).isActive(true).sportId(sportId).build()).getId();
        otherGroupId = groupRepository.save(Group.builder().groupName("SESSION-GROUP-2 other " + UUID.randomUUID())
                .createdBy(ownerId).isPrivate(true).isActive(true).sportId(sportId).build()).getId();
        groupMemberRepository.save(GroupMember.builder().groupId(groupId).userId(ownerId).roleId(OWNER_ROLE_ID).build());
        groupMemberRepository.save(GroupMember.builder().groupId(groupId).userId(memberId).roleId(MEMBER_ROLE_ID).build());
    }

    @AfterEach
    void tearDownFixtures() {
        clearAll();
    }

    private void clearAll() {
        commentRepository.deleteAll();
        sessionRepository.deleteAll();
        groupMemberRepository.deleteAll();
        groupRepository.deleteAll();
        postRepository.deleteAll();
        userRepository.deleteAll();
        sportRepository.deleteAll();
        evictSportCache();
    }

    private void evictSportCache() {
        if (cacheManager.getCache("sports") != null) {
            cacheManager.getCache("sports").clear();
        }
    }

    /** A session of {@code group} in {@code status} starting {@code startOffsetHours} after the base instant. */
    private Long seed(Long group, SessionStatus status, int startOffsetHours, String title) {
        Long postId = postRepository.save(Post.builder().userId(ownerId).groupId(null).postType(PostType.SESSION_POST)
                .content("Session: fixture").visibility("private").isActive(true).build()).getId();
        return sessionRepository.save(Session.builder().title(title)
                .groupId(group).isPublic(false).postId(postId)
                .sessionType(group == null ? SessionType.STANDALONE : SessionType.GROUP_RECURRING)
                .createdBy(ownerId).sportId(sportId).locationId(1L)
                .scheduledStart(base.plusSeconds(startOffsetHours * 3600L)).scheduledEndAt(base.plusSeconds(startOffsetHours * 3600L + 5400))
                .status(status).capacity(10).feeType(FeeType.FREE).initialSlot(0).gameMood(5).autoApprove(true)
                .build()).getId();
    }

    private ResultActions list(UUID userId, String query) throws Exception {
        return mockMvc.perform(get("/api/sessions/group/{id}" + query, groupId).header("Authorization", bearer(userId)));
    }

    private List<String> titles(ResultActions result) throws Exception {
        JsonNode content = objectMapper.readTree(result.andExpect(status().isOk()).andReturn().getResponse().getContentAsString())
                .get("data").get("content");
        List<String> titles = new ArrayList<>();
        content.forEach(node -> titles.add(node.get("title").asText()));
        return titles;
    }

    private void seedEverySessionKind() {
        seed(groupId, SessionStatus.SCHEDULED, 30, "scheduled-late");
        seed(groupId, SessionStatus.SCHEDULED, 10, "scheduled-soon");
        seed(groupId, SessionStatus.PREPARING, 20, "preparing");
        seed(groupId, SessionStatus.ONGOING, 5, "ongoing");
        seed(groupId, SessionStatus.COMPLETED, -40, "done-old");
        seed(groupId, SessionStatus.COMPLETED, -10, "done-new");
        seed(groupId, SessionStatus.CANCELLED, -20, "cancelled-mid");
        // Never in this group's list: another group's session and a standalone one.
        seed(otherGroupId, SessionStatus.SCHEDULED, 1, "other-group");
        seed(null, SessionStatus.SCHEDULED, 2, "standalone");
    }

    @Test
    void eachBucket_returnsOnlyItsStatuses_inTheFixedOrder() throws Exception {
        seedEverySessionKind();

        assertThat(titles(list(memberId, "?bucket=SCHEDULED"))).containsExactly("scheduled-soon", "scheduled-late");
        assertThat(titles(list(memberId, "?bucket=PREPARING"))).containsExactly("preparing");
        assertThat(titles(list(memberId, "?bucket=ONGOING"))).containsExactly("ongoing");
        // History: COMPLETED and CANCELLED together, newest start first.
        assertThat(titles(list(memberId, "?bucket=HISTORY"))).containsExactly("done-new", "cancelled-mid", "done-old");
    }

    @Test
    void preparingIsItsOwnBucket_neverMixedIntoScheduled() throws Exception {
        seedEverySessionKind();

        assertThat(titles(list(memberId, "?bucket=SCHEDULED"))).doesNotContain("preparing");
        assertThat(titles(list(memberId, "?bucket=PREPARING"))).doesNotContain("scheduled-soon", "scheduled-late");
    }

    @Test
    void theCallersOwnSort_isIgnoredWhenABucketIsGiven() throws Exception {
        seedEverySessionKind();

        assertThat(titles(list(memberId, "?bucket=SCHEDULED&sort=title,desc"))).containsExactly("scheduled-soon", "scheduled-late");
        assertThat(titles(list(memberId, "?bucket=HISTORY&sort=title,asc"))).containsExactly("done-new", "cancelled-mid", "done-old");
    }

    @Test
    void aBucketIsPaged() throws Exception {
        seedEverySessionKind();

        assertThat(titles(list(memberId, "?bucket=HISTORY&size=2&page=0"))).containsExactly("done-new", "cancelled-mid");
        assertThat(titles(list(memberId, "?bucket=HISTORY&size=2&page=1"))).containsExactly("done-old");
    }

    @Test
    void noBucket_keepsEveryStatusOfThisGroupOnly() throws Exception {
        seedEverySessionKind();

        assertThat(titles(list(memberId, ""))).containsExactlyInAnyOrder("scheduled-late", "scheduled-soon", "preparing",
                "ongoing", "done-old", "done-new", "cancelled-mid");
    }

    @Test
    void theBucketIsCaseInsensitive_andABadValueIs400() throws Exception {
        seedEverySessionKind();

        assertThat(titles(list(memberId, "?bucket=history"))).hasSize(3);
        list(memberId, "?bucket=NEXT").andExpect(status().isBadRequest());
    }

    @Test
    void aNonMember_isRefusedWith403_withOrWithoutABucket() throws Exception {
        seedEverySessionKind();

        list(outsiderId, "?bucket=SCHEDULED").andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_GROUP_MEMBER_REQUIRED"));
        list(outsiderId, "").andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_GROUP_MEMBER_REQUIRED"));
    }

    @Test
    void anEmptyBucket_isAnEmptyPage() throws Exception {
        seed(groupId, SessionStatus.SCHEDULED, 10, "only-scheduled");

        assertThat(titles(list(memberId, "?bucket=ONGOING"))).isEmpty();
    }
}
