package com.sportconnect.integration;

import com.sportconnect.group.entity.Group;
import com.sportconnect.group.entity.GroupMember;
import com.sportconnect.group.repository.GroupMemberRepository;
import com.sportconnect.group.repository.GroupRepository;
import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.ResultActions;

import java.util.UUID;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * B23 - {@code GET /api/groups/{groupId}/members/search}, through the real controller, {@code GroupServiceImpl},
 * {@code UserServiceImpl} and the native name-search query on the H2 test database. Covers the boundary (a member
 * of any role in, a non-member out with 403, a missing or inactive group 404 before that), who is listed, the name
 * rule, the size cap and what the response carries.
 */
class GroupMemberSearchIntegrationTest extends BaseIT {

    private static final Integer ROLE_MEMBER = 3;

    @Autowired
    private GroupRepository groupRepository;
    @Autowired
    private GroupMemberRepository groupMemberRepository;
    @Autowired
    private UserRepository userRepository;

    private UUID viewerId;
    private Long groupId;

    @BeforeEach
    void setUpFixtures() {
        clearAll();
        viewerId = createUser("Viewer", "Person", true).getId();
        groupId = createGroup(false, true);
        addMember(groupId, viewerId);
    }

    @AfterEach
    void tearDownFixtures() {
        clearAll();
    }

    private void clearAll() {
        groupMemberRepository.deleteAll();
        groupRepository.deleteAll();
        userRepository.deleteAll();
    }

    private User createUser(String firstName, String lastName, boolean active) {
        User user = new User();
        user.setUsername("u_" + UUID.randomUUID());
        user.setEmail("u_" + UUID.randomUUID() + "@example.com");
        user.setFirstName(firstName);
        user.setLastName(lastName);
        user.setIsEmailVerified(false);
        user.setIsActive(active);
        return userRepository.save(user);
    }

    private Long createGroup(boolean isPrivate, boolean isActive) {
        return groupRepository.save(Group.builder()
                .groupName("Member search group " + UUID.randomUUID())
                .createdBy(viewerId)
                .isPrivate(isPrivate)
                .isActive(isActive)
                .build()).getId();
    }

    private void addMember(Long group, UUID userId) {
        groupMemberRepository.save(GroupMember.builder().groupId(group).userId(userId).roleId(ROLE_MEMBER).build());
    }

    private void member(String firstName, String lastName) {
        addMember(groupId, createUser(firstName, lastName, true).getId());
    }

    private ResultActions search(Long group, UUID caller, String q) throws Exception {
        return mockMvc.perform(get("/api/groups/{id}/members/search", group)
                .param("q", q).header("Authorization", bearerFor(caller, "USER")));
    }

    private ResultActions search(String q) throws Exception {
        return search(groupId, viewerId, q).andExpect(status().isOk());
    }

    // -- authorization boundary ---------------------------------------------

    @Test
    void aNonMemberIsForbidden_evenForAPublicGroup() throws Exception {
        UUID stranger = createUser("Stranger", "Person", true).getId();

        mockMvc.perform(get("/api/groups/{id}/members/search", groupId).header("Authorization", bearerFor(stranger, "USER")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("GROUP_MEMBER_REQUIRED"));
    }

    @Test
    void aNonMemberOfAPrivateGroupIsForbidden_andAMemberOfItIsServed() throws Exception {
        Long privateGroup = createGroup(true, true);
        addMember(privateGroup, viewerId);
        UUID stranger = createUser("Stranger", "Person", true).getId();

        search(privateGroup, stranger, "").andExpect(status().isForbidden());
        search(privateGroup, viewerId, "").andExpect(status().isOk());
    }

    @Test
    void aMissingGroupAndAnInactiveGroupAreNotFound_notForbidden() throws Exception {
        Long deleted = createGroup(false, false);
        addMember(deleted, viewerId);

        search(999_999L, viewerId, "").andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("GROUP_NOT_FOUND"));
        search(deleted, viewerId, "").andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("GROUP_NOT_FOUND"));
    }

    @Test
    void anUnauthenticatedCallerIsRefused() throws Exception {
        mockMvc.perform(get("/api/groups/{id}/members/search", groupId))
                .andExpect(status().is4xxClientError());
    }

    // -- who is listed ------------------------------------------------------

    @Test
    void everyActiveMemberIsListed_theCallerToo_andNobodyFromAnotherGroup() throws Exception {
        member("Aaa", "One");
        member("Bbb", "Two");
        Long other = createGroup(false, true);
        addMember(other, createUser("Outsider", "Else", true).getId());

        search("").andExpect(jsonPath("$.data", hasSize(3)))
                .andExpect(jsonPath("$.data[?(@.fullName == 'Aaa One')]").exists())
                .andExpect(jsonPath("$.data[?(@.fullName == 'Bbb Two')]").exists())
                .andExpect(jsonPath("$.data[?(@.fullName == 'Viewer Person')]").exists())
                .andExpect(jsonPath("$.data[?(@.fullName == 'Outsider Else')]").doesNotExist());
    }

    @Test
    void aDeactivatedMemberAndAMemberWithNoNameAreNotListed_andNoPrivateFieldLeaks() throws Exception {
        addMember(groupId, createUser("Gone", "Away", false).getId());
        addMember(groupId, createUser(null, null, true).getId());
        member("Visible", "Person");

        search("").andExpect(jsonPath("$.data", hasSize(2)))
                .andExpect(jsonPath("$.data[?(@.fullName == 'Gone Away')]").doesNotExist())
                .andExpect(jsonPath("$.data[0].userId").exists())
                .andExpect(jsonPath("$.data[0].avatarUrl").hasJsonPath())
                .andExpect(jsonPath("$.data[0].email").doesNotExist())
                .andExpect(jsonPath("$.data[0].username").doesNotExist())
                .andExpect(jsonPath("$.data[0].role").doesNotExist())
                .andExpect(jsonPath("$.data[0].roleName").doesNotExist());
    }

    // -- the name rule ------------------------------------------------------

    @Test
    void accentsAndCaseAreIgnored_includingTheVietnameseD() throws Exception {
        member("Tuấn", "Nguyễn");
        member("Minh", "Đặng");

        search("TUAN").andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].fullName").value("Tuấn Nguyễn"));
        search("nguyen").andExpect(jsonPath("$.data", hasSize(1)));
        search("dang").andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].fullName").value("Minh Đặng"));
    }

    @Test
    void aWordMustStartAName_neverTheMiddleOfOne() throws Exception {
        member("Bao", "Tran");
        member("Binh", "An");

        search("an").andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].fullName").value("Binh An"));
        search("ran").andExpect(jsonPath("$.data", hasSize(0)));
    }

    @Test
    void everyWordOfAMultiWordQueryMustMatch_inAnyOrder() throws Exception {
        member("Tuấn Anh", "Nguyễn");

        search("anh tu").andExpect(jsonPath("$.data", hasSize(1)));
        search("nguyen tuan").andExpect(jsonPath("$.data", hasSize(1)));
        search("anh zzz").andExpect(jsonPath("$.data", hasSize(0)));
    }

    @Test
    void theUsernameIsNeverSearched() throws Exception {
        User user = createUser("Plain", "Name", true);
        user.setUsername("zzhandle");
        userRepository.save(user);
        addMember(groupId, user.getId());

        search("zzhandle").andExpect(jsonPath("$.data", hasSize(0)));
    }

    @Test
    void aVeryLongQueryIsCutNotRefused() throws Exception {
        member("Aaa", "One");

        search("a".repeat(500)).andExpect(jsonPath("$.data", hasSize(0)));
    }

    // -- the cap ------------------------------------------------------------

    @Test
    void theSizeDefaultsToFive_isCutToTwenty_andIsAtLeastOne() throws Exception {
        for (int i = 0; i < 24; i++) {
            member("Person" + (char) ('a' + i), "Same");
        }
        String auth = bearerFor(viewerId, "USER");

        mockMvc.perform(get("/api/groups/{id}/members/search", groupId).header("Authorization", auth))
                .andExpect(jsonPath("$.data", hasSize(5)));
        mockMvc.perform(get("/api/groups/{id}/members/search", groupId).param("size", "100").header("Authorization", auth))
                .andExpect(jsonPath("$.data", hasSize(20)));
        mockMvc.perform(get("/api/groups/{id}/members/search", groupId).param("size", "2").header("Authorization", auth))
                .andExpect(jsonPath("$.data", hasSize(2)));
        mockMvc.perform(get("/api/groups/{id}/members/search", groupId).param("size", "0").header("Authorization", auth))
                .andExpect(jsonPath("$.data", hasSize(1)));
    }
}
