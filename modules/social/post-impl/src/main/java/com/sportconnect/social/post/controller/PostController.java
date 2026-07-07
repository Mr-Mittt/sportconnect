package com.sportconnect.social.post.controller;

import com.sportconnect.common.auth.SecurityUtils;
import com.sportconnect.common.dto.ApiResponse;
import com.sportconnect.social.post.api.dto.CommentResponse;
import com.sportconnect.social.post.api.dto.CreateCommentRequest;
import com.sportconnect.social.post.api.dto.CreatePostRequest;
import com.sportconnect.social.post.api.dto.PostResponse;
import com.sportconnect.social.post.api.dto.UpdateBroadcastEndTimeRequest;
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
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

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
            @AuthenticationPrincipal String userIdStr,
            @Valid @RequestBody CreatePostRequest request) {
        PostResponse response = postService.createPost(UUID.fromString(userIdStr), request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Post created successfully", response));
    }

    @GetMapping("/{postId}")
    public ResponseEntity<ApiResponse<PostResponse>> getPost(
            @PathVariable Long postId,
            Authentication authentication) {
        PostResponse response = postService.getPostById(postId, SecurityUtils.extractUserId(authentication));
        return ResponseEntity.ok(ApiResponse.success("Post retrieved successfully", response));
    }

    @GetMapping("/mine")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Page<PostResponse>>> getMyPosts(
            @AuthenticationPrincipal String userIdStr,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        UUID userId = UUID.fromString(userIdStr);
        Page<PostResponse> response = postService.getUserPosts(userId, userId, pageable);
        return ResponseEntity.ok(ApiResponse.success("User posts retrieved successfully", response));
    }

    @GetMapping("/feed")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Page<PostResponse>>> getPersonalizedFeed(
            @AuthenticationPrincipal String userIdStr,
            @PageableDefault(size = 20, sort = "lastInteractionAt", direction = Sort.Direction.DESC) Pageable pageable) {
        Page<PostResponse> response = postService.getPersonalizedFeed(UUID.fromString(userIdStr), pageable);
        return ResponseEntity.ok(ApiResponse.success("Feed retrieved successfully", response));
    }

    @GetMapping("/broadcast")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Page<PostResponse>>> getActiveBroadcasts(
            @AuthenticationPrincipal String userIdStr,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        Page<PostResponse> response = postService.getActiveBroadcasts(UUID.fromString(userIdStr), pageable);
        return ResponseEntity.ok(ApiResponse.success("Active broadcasts retrieved successfully", response));
    }

    @GetMapping("/group/{groupId}")
    public ResponseEntity<ApiResponse<Page<PostResponse>>> getGroupPosts(
            @PathVariable Long groupId,
            Authentication authentication,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        Page<PostResponse> response = postService.getGroupPosts(groupId, SecurityUtils.extractUserId(authentication), pageable);
        return ResponseEntity.ok(ApiResponse.success("Group posts retrieved successfully", response));
    }

    @PutMapping("/{postId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<PostResponse>> updatePost(
            @PathVariable Long postId,
            @AuthenticationPrincipal String userIdStr,
            @Valid @RequestBody CreatePostRequest request) {
        PostResponse response = postService.updatePost(postId, UUID.fromString(userIdStr), request);
        return ResponseEntity.ok(ApiResponse.success("Post updated successfully", response));
    }

    @PatchMapping("/{postId}/broadcast-end-time")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<PostResponse>> updateBroadcastEndTime(
            @PathVariable Long postId,
            @AuthenticationPrincipal String userIdStr,
            @Valid @RequestBody UpdateBroadcastEndTimeRequest request) {
        PostResponse response = postService.updateBroadcastEndTime(
                postId, UUID.fromString(userIdStr), request.getBroadcastEndTime());
        return ResponseEntity.ok(ApiResponse.success("Broadcast end time updated successfully", response));
    }

    @DeleteMapping("/{postId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> deletePost(
            @PathVariable Long postId,
            @AuthenticationPrincipal String userIdStr) {
        postService.deletePost(postId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.success("Post deleted successfully", null));
    }

    @PostMapping("/{postId}/like")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> likePost(
            @PathVariable Long postId,
            @AuthenticationPrincipal String userIdStr) {
        postService.likePost(postId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.success("Post liked successfully", null));
    }

    @DeleteMapping("/{postId}/like")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> unlikePost(
            @PathVariable Long postId,
            @AuthenticationPrincipal String userIdStr) {
        postService.unlikePost(postId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.success("Post unliked successfully", null));
    }

    @PostMapping("/{postId}/comments")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<CommentResponse>> createComment(
            @PathVariable Long postId,
            @AuthenticationPrincipal String userIdStr,
            @Valid @RequestBody CreateCommentRequest request) {
        CommentResponse response = commentService.createComment(postId, UUID.fromString(userIdStr), request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Comment created successfully", response));
    }

    @GetMapping("/{postId}/comments")
    public ResponseEntity<ApiResponse<Page<CommentResponse>>> getPostComments(
            @PathVariable Long postId,
            Authentication authentication,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        Page<CommentResponse> response = commentService.getPostComments(postId, SecurityUtils.extractUserId(authentication), pageable);
        return ResponseEntity.ok(ApiResponse.success("Comments retrieved successfully", response));
    }

    @DeleteMapping("/comments/{commentId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> deleteComment(
            @PathVariable Long commentId,
            @AuthenticationPrincipal String userIdStr) {
        commentService.deleteComment(commentId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.success("Comment deleted successfully", null));
    }

    @PostMapping("/comments/{commentId}/like")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> likeComment(
            @PathVariable Long commentId,
            @AuthenticationPrincipal String userIdStr) {
        commentService.likeComment(commentId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.success("Comment liked successfully", null));
    }

    @DeleteMapping("/comments/{commentId}/like")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> unlikeComment(
            @PathVariable Long commentId,
            @AuthenticationPrincipal String userIdStr) {
        commentService.unlikeComment(commentId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.success("Comment unliked successfully", null));
    }

    @GetMapping("/hashtag/{tag}")
    public ResponseEntity<ApiResponse<Page<PostResponse>>> getPostsByHashtag(
            @PathVariable String tag,
            Authentication authentication,
            @PageableDefault(size = 20, sort = "lastInteractionAt", direction = Sort.Direction.DESC) Pageable pageable) {
        Page<PostResponse> response = postService.getPostsByHashtag(tag, SecurityUtils.extractUserId(authentication), pageable);
        return ResponseEntity.ok(ApiResponse.success("Posts retrieved successfully", response));
    }
}
