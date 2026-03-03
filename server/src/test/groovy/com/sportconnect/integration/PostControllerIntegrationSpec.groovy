package com.sportconnect.integration

import com.fasterxml.jackson.databind.ObjectMapper
import com.sportconnect.social.api.dto.CreateCommentRequest
import com.sportconnect.social.api.dto.CreatePostRequest
import com.sportconnect.social.repository.CommentRepository
import com.sportconnect.social.repository.PostLikeRepository
import com.sportconnect.social.repository.PostRepository
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.transaction.annotation.Transactional
import spock.lang.Specification

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class PostControllerIntegrationSpec extends Specification {

    @Autowired
    MockMvc mockMvc

    @Autowired
    ObjectMapper objectMapper

    @Autowired
    PostRepository postRepository

    @Autowired
    PostLikeRepository postLikeRepository

    @Autowired
    CommentRepository commentRepository

    def userId = UUID.randomUUID()

    def cleanup() {
        commentRepository.deleteAll()
        postLikeRepository.deleteAll()
        postRepository.deleteAll()
    }

    def "POST /api/posts should create a new post"() {
        given: "a create post request"
        def request = CreatePostRequest.builder()
                .content("Integration test post")
                .latitude(37.7749)
                .longitude(-122.4194)
                .locationName("San Francisco")
                .sportId(1L)
                .visibility("public")
                .build()

        when: "creating a post"
        def result = mockMvc.perform(post("/api/posts")
                .param("userId", userId.toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))

        then: "post is created successfully"
        result.andExpect(status().isCreated())
                .andExpect(jsonPath('$.success').value(true))
                .andExpect(jsonPath('$.message').value("Post created successfully"))
                .andExpect(jsonPath('$.data.content').value("Integration test post"))
                .andExpect(jsonPath('$.data.locationName').value("San Francisco"))
                .andExpect(jsonPath('$.data.userId').value(userId.toString()))
    }

    def "GET /api/posts/{postId} should return post details"() {
        given: "an existing post"
        def createRequest = CreatePostRequest.builder()
                .content("Test post for retrieval")
                .visibility("public")
                .build()

        def createResult = mockMvc.perform(post("/api/posts")
                .param("userId", userId.toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(createRequest)))
                .andReturn()

        def response = objectMapper.readTree(createResult.response.contentAsString)
        def postId = response.get("data").get("id").asLong()

        when: "getting the post"
        def result = mockMvc.perform(get("/api/posts/{postId}", postId)
                .param("currentUserId", userId.toString()))

        then: "post details are returned"
        result.andExpect(status().isOk())
                .andExpect(jsonPath('$.success').value(true))
                .andExpect(jsonPath('$.data.id').value(postId))
                .andExpect(jsonPath('$.data.content').value("Test post for retrieval"))
                .andExpect(jsonPath('$.data.likeCount').value(0))
                .andExpect(jsonPath('$.data.commentCount').value(0))
    }

    def "GET /api/posts/feed should return public feed"() {
        given: "multiple public posts"
        def request1 = CreatePostRequest.builder()
                .content("Public post 1")
                .visibility("public")
                .build()
        def request2 = CreatePostRequest.builder()
                .content("Public post 2")
                .visibility("public")
                .build()

        mockMvc.perform(post("/api/posts")
                .param("userId", userId.toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request1)))

        mockMvc.perform(post("/api/posts")
                .param("userId", userId.toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request2)))

        when: "getting public feed"
        def result = mockMvc.perform(get("/api/posts/feed")
                .param("currentUserId", userId.toString()))

        then: "feed contains posts"
        result.andExpect(status().isOk())
                .andExpect(jsonPath('$.success').value(true))
                .andExpect(jsonPath('$.data.content').isArray())
                .andExpect(jsonPath('$.data.content.length()').value(2))
    }

    def "PUT /api/posts/{postId} should update post"() {
        given: "an existing post"
        def createRequest = CreatePostRequest.builder()
                .content("Original content")
                .visibility("public")
                .build()

        def createResult = mockMvc.perform(post("/api/posts")
                .param("userId", userId.toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(createRequest)))
                .andReturn()

        def response = objectMapper.readTree(createResult.response.contentAsString)
        def postId = response.get("data").get("id").asLong()

        and: "an update request"
        def updateRequest = CreatePostRequest.builder()
                .content("Updated content")
                .locationName("New Location")
                .build()

        when: "updating the post"
        def result = mockMvc.perform(put("/api/posts/{postId}", postId)
                .param("userId", userId.toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(updateRequest)))

        then: "post is updated"
        result.andExpect(status().isOk())
                .andExpect(jsonPath('$.success').value(true))
                .andExpect(jsonPath('$.data.content').value("Updated content"))
                .andExpect(jsonPath('$.data.locationName').value("New Location"))
    }

    def "DELETE /api/posts/{postId} should delete post"() {
        given: "an existing post"
        def createRequest = CreatePostRequest.builder()
                .content("Post to delete")
                .visibility("public")
                .build()

        def createResult = mockMvc.perform(post("/api/posts")
                .param("userId", userId.toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(createRequest)))
                .andReturn()

        def response = objectMapper.readTree(createResult.response.contentAsString)
        def postId = response.get("data").get("id").asLong()

        when: "deleting the post"
        def result = mockMvc.perform(delete("/api/posts/{postId}", postId)
                .param("userId", userId.toString()))

        then: "post is deleted"
        result.andExpect(status().isOk())
                .andExpect(jsonPath('$.success').value(true))

        and: "post is no longer accessible"
        mockMvc.perform(get("/api/posts/{postId}", postId))
                .andExpect(status().isNotFound())
    }

    def "POST /api/posts/{postId}/like should like a post"() {
        given: "an existing post"
        def createRequest = CreatePostRequest.builder()
                .content("Post to like")
                .visibility("public")
                .build()

        def createResult = mockMvc.perform(post("/api/posts")
                .param("userId", userId.toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(createRequest)))
                .andReturn()

        def response = objectMapper.readTree(createResult.response.contentAsString)
        def postId = response.get("data").get("id").asLong()

        when: "liking the post"
        def result = mockMvc.perform(post("/api/posts/{postId}/like", postId)
                .param("userId", userId.toString()))

        then: "post is liked"
        result.andExpect(status().isOk())
                .andExpect(jsonPath('$.success').value(true))

        and: "like count is updated"
        mockMvc.perform(get("/api/posts/{postId}", postId)
                .param("currentUserId", userId.toString()))
                .andExpect(jsonPath('$.data.likeCount').value(1))
                .andExpect(jsonPath('$.data.isLikedByCurrentUser').value(true))
    }

    def "DELETE /api/posts/{postId}/like should unlike a post"() {
        given: "a liked post"
        def createRequest = CreatePostRequest.builder()
                .content("Post to unlike")
                .visibility("public")
                .build()

        def createResult = mockMvc.perform(post("/api/posts")
                .param("userId", userId.toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(createRequest)))
                .andReturn()

        def response = objectMapper.readTree(createResult.response.contentAsString)
        def postId = response.get("data").get("id").asLong()

        mockMvc.perform(post("/api/posts/{postId}/like", postId)
                .param("userId", userId.toString()))

        when: "unliking the post"
        def result = mockMvc.perform(delete("/api/posts/{postId}/like", postId)
                .param("userId", userId.toString()))

        then: "post is unliked"
        result.andExpect(status().isOk())
                .andExpect(jsonPath('$.success').value(true))

        and: "like count is updated"
        mockMvc.perform(get("/api/posts/{postId}", postId)
                .param("currentUserId", userId.toString()))
                .andExpect(jsonPath('$.data.likeCount').value(0))
                .andExpect(jsonPath('$.data.isLikedByCurrentUser').value(false))
    }

    def "POST /api/posts/{postId}/comments should add a comment"() {
        given: "an existing post"
        def createRequest = CreatePostRequest.builder()
                .content("Post for comments")
                .visibility("public")
                .build()

        def createResult = mockMvc.perform(post("/api/posts")
                .param("userId", userId.toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(createRequest)))
                .andReturn()

        def response = objectMapper.readTree(createResult.response.contentAsString)
        def postId = response.get("data").get("id").asLong()

        and: "a comment request"
        def commentRequest = CreateCommentRequest.builder()
                .content("Test comment")
                .build()

        when: "adding a comment"
        def result = mockMvc.perform(post("/api/posts/{postId}/comments", postId)
                .param("userId", userId.toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(commentRequest)))

        then: "comment is created"
        result.andExpect(status().isCreated())
                .andExpect(jsonPath('$.success').value(true))
                .andExpect(jsonPath('$.data.content').value("Test comment"))
                .andExpect(jsonPath('$.data.postId').value(postId))

        and: "comment count is updated"
        mockMvc.perform(get("/api/posts/{postId}", postId)
                .param("currentUserId", userId.toString()))
                .andExpect(jsonPath('$.data.commentCount').value(1))
    }

    def "GET /api/posts/{postId}/comments should return comments"() {
        given: "a post with comments"
        def createRequest = CreatePostRequest.builder()
                .content("Post with comments")
                .visibility("public")
                .build()

        def createResult = mockMvc.perform(post("/api/posts")
                .param("userId", userId.toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(createRequest)))
                .andReturn()

        def response = objectMapper.readTree(createResult.response.contentAsString)
        def postId = response.get("data").get("id").asLong()

        def commentRequest = CreateCommentRequest.builder()
                .content("First comment")
                .build()

        mockMvc.perform(post("/api/posts/{postId}/comments", postId)
                .param("userId", userId.toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(commentRequest)))

        when: "getting comments"
        def result = mockMvc.perform(get("/api/posts/{postId}/comments", postId)
                .param("currentUserId", userId.toString()))

        then: "comments are returned"
        result.andExpect(status().isOk())
                .andExpect(jsonPath('$.success').value(true))
                .andExpect(jsonPath('$.data.content').isArray())
                .andExpect(jsonPath('$.data.content.length()').value(1))
                .andExpect(jsonPath('$.data.content[0].content').value("First comment"))
    }
}
