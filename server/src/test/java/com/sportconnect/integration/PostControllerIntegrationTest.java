package com.sportconnect.integration;

import com.sportconnect.social.post.api.dto.CreateCommentRequest;
import com.sportconnect.social.post.api.dto.CreatePostRequest;
import com.sportconnect.social.post.repository.CommentRepository;
import com.sportconnect.social.post.repository.HashtagRepository;
import com.sportconnect.social.post.repository.PostHashtagRepository;
import com.sportconnect.social.post.repository.PostLikeRepository;
import com.sportconnect.social.post.repository.PostRepository;
import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class PostControllerIntegrationTest extends BaseIT {

    @Autowired
    private PostRepository postRepository;

    @Autowired
    private PostLikeRepository postLikeRepository;

    @Autowired
    private CommentRepository commentRepository;

    @Autowired
    private PostHashtagRepository postHashtagRepository;

    @Autowired
    private HashtagRepository hashtagRepository;

    @Autowired
    private UserRepository userRepository;

    private UUID userId;

    @BeforeEach
    @Override
    public void baseSetup() {
        super.baseSetup();
        // Create a test user
        User user = new User();
        user.setUsername("testuser_" + System.currentTimeMillis());
        user.setEmail("test" + System.currentTimeMillis() + "@example.com");
        user.setPasswordHash("password");
        user.setFirstName("Test");
        user.setLastName("User");
        user.setIsEmailVerified(false);
        user.setIsActive(true);
        User savedUser = userRepository.save(user);
        userId = savedUser.getId();
        authenticateAs(userId);
    }

    @AfterEach
    void cleanup() {
        commentRepository.deleteAll();
        postLikeRepository.deleteAll();
        postHashtagRepository.deleteAll();
        hashtagRepository.deleteAll();
        postRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    void shouldCreatePost() throws Exception {
        CreatePostRequest request = CreatePostRequest.builder()
                .content("Integration test post")
                .latitude(37.7749)
                .longitude(-122.4194)
                .locationName("San Francisco")
                .sportId(1L)
                .visibility("public")
                .build();

        mockMvc.perform(post("/api/posts")
                .param("userId", userId.toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content(toJson(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Post created successfully"))
                .andExpect(jsonPath("$.data.content").value("Integration test post"))
                .andExpect(jsonPath("$.data.locationName").value("San Francisco"))
                .andExpect(jsonPath("$.data.userId").value(userId.toString()));
    }

    @Test
    void shouldReturnPostsByHashtagWithoutThrowing() throws Exception {
        // A10 regression: PostController's @PageableDefault used to also carry a
        // sort, which Spring Data appended as a second ORDER BY resolved against
        // findPostsByHashtag's FROM root (PostHashtag, no lastInteractionAt field
        // of its own) — every call 500'd with UnknownPathException regardless of
        // whether any matching post existed.
        CreatePostRequest request = CreatePostRequest.builder()
                .content("Testing #a10fix hashtag support")
                .latitude(37.7749)
                .longitude(-122.4194)
                .locationName("San Francisco")
                .sportId(1L)
                .visibility("public")
                .build();

        mockMvc.perform(post("/api/posts")
                .param("userId", userId.toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content(toJson(request)))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/posts/hashtag/a10fix"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.content[0].content").value("Testing #a10fix hashtag support"));
    }
}
