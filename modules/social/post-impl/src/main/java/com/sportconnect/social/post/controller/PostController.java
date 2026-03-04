package com.sportconnect.social.post.controller;

import com.sportconnect.common.dto.ApiResponse;
import com.sportconnect.social.post.api.dto.CommentResponse;
import com.sportconnect.social.post.api.dto.CreateCommentRequest;
import com.sportconnect.social.post.api.dto.CreatePostRequest;
import com.sportconnect.social.post.api.dto.PostResponse;
import com.sportconnect.social.post.api.service.CommentService;
import com.sportconnect.social.post.api.service.PostService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/posts")
@RequiredArgsConstructor
public class PostController {

    private final PostService postService;
    private final CommentService commentService;

    @PostMapping
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<PostResponse>> createPost(
            @RequestParam UUID userId,
            @Valid @RequestBody CreatePostRequest request) {
        PostResponse response = postService.createPost(userId, request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Post created successfully", response));
    }

    @GetMapping("/{postId}")
    public ResponseEntity<ApiResponse<PostResponse>> getPost(
            @PathVariable Long postId,
            @RequestParam(required = false) UUID currentUserId) {
        PostResponse response = postService.getPostById(postId, currentUserId);
        return ResponseEntity.ok(ApiResponse.success("Post retrieved successfully", response));
    }

    @GetMapping("/user/{userId}")
    public ResponseEntity<ApiResponse<Page<PostResponse>>> getUserPosts(
            @PathVariable UUID userId,
            @RequestParam(required = false) UUID currentUserId,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        Page<PostResponse> response = postService.getUserPosts(userId, currentUserId, pageable);
        return ResponseEntity.ok(ApiResponse.success("User posts retrieved successfully", response));
    }

    @GetMapping("/feed")
    public ResponseEntity<ApiResponse<Page<PostResponse>>> getPublicFeed(
            @RequestParam(required = false) UUID currentUserId,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        Page<PostResponse> response = postService.getPublicFeed(currentUserId, pageable);
        return ResponseEntity.ok(ApiResponse.success("Feed retrieved successfully", response));
    }

    @GetMapping("/group/{groupId}")
    public ResponseEntity<ApiResponse<Page<PostResponse>>> getGroupPosts(
            @PathVariable Long groupId,
            @RequestParam(required = false) UUID currentUserId,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        Page<PostResponse> response = postService.getGroupPosts(groupId, currentUserId, pageable);
        return ResponseEntity.ok(ApiResponse.success("Group posts retrieved successfully", response));
    }

    @PutMapping("/{postId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<PostResponse>> updatePost(
            @PathVariable Long postId,
            @RequestParam UUID userId,
            @Valid @RequestBody CreatePostRequest request) {
        PostResponse response = postService.updatePost(postId, userId, request);
        return ResponseEntity.ok(ApiResponse.success("Post updated successfully", response));
    }

    @DeleteMapping("/{postId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> deletePost(
            @PathVariable Long postId,
            @RequestParam UUID userId) {
        postService.deletePost(postId, userId);
        return ResponseEntity.ok(ApiResponse.success("Post deleted successfully", null));
    }

    @PostMapping("/{postId}/like")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> likePost(
            @PathVariable Long postId,
            @RequestParam UUID userId) {
        postService.likePost(postId, userId);
        return ResponseEntity.ok(ApiResponse.success("Post liked successfully", null));
    }

    @DeleteMapping("/{postId}/like")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> unlikePost(
            @PathVariable Long postId,
            @RequestParam UUID userId) {
        postService.unlikePost(postId, userId);
        return ResponseEntity.ok(ApiResponse.success("Post unliked successfully", null));
    }

    @PostMapping("/{postId}/comments")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<CommentResponse>> createComment(
            @PathVariable Long postId,
            @RequestParam UUID userId,
            @Valid @RequestBody CreateCommentRequest request) {
        CommentResponse response = commentService.createComment(postId, userId, request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Comment created successfully", response));
    }

    @GetMapping("/{postId}/comments")
    public ResponseEntity<ApiResponse<Page<CommentResponse>>> getPostComments(
            @PathVariable Long postId,
            @RequestParam(required = false) UUID currentUserId,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        Page<CommentResponse> response = commentService.getPostComments(postId, currentUserId, pageable);
        return ResponseEntity.ok(ApiResponse.success("Comments retrieved successfully", response));
    }

    @DeleteMapping("/comments/{commentId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> deleteComment(
            @PathVariable Long commentId,
            @RequestParam UUID userId) {
        commentService.deleteComment(commentId, userId);
        return ResponseEntity.ok(ApiResponse.success("Comment deleted successfully", null));
    }

    @PostMapping("/comments/{commentId}/like")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> likeComment(
            @PathVariable Long commentId,
            @RequestParam UUID userId) {
        commentService.likeComment(commentId, userId);
        return ResponseEntity.ok(ApiResponse.success("Comment liked successfully", null));
    }

    @DeleteMapping("/comments/{commentId}/like")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> unlikeComment(
            @PathVariable Long commentId,
            @RequestParam UUID userId) {
        commentService.unlikeComment(commentId, userId);
        return ResponseEntity.ok(ApiResponse.success("Comment unliked successfully", null));
    }
}
