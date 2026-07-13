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
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
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
@Tag(name = "Posts", description = "Post CRUD, personalized feed, group broadcasts, likes, and comments.")
public class PostController {

    private final PostService postService;
    private final CommentService commentService;

    @Operation(summary = "Create a post", description = "USER_FEED, GROUP_POST, or GROUP_BROADCAST depending on postType/groupId — see request schema. GROUP_BROADCAST is owner/admin-only and limited to one active broadcast per group.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "Post created"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Validation failed, invalid postType/groupId combination, not a group member, not owner/admin for a broadcast, or the group already has an active broadcast"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @PostMapping
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<PostResponse>> createPost(
            @AuthenticationPrincipal String userIdStr,
            @Valid @RequestBody CreatePostRequest request) {
        PostResponse response = postService.createPost(UUID.fromString(userIdStr), request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Post created successfully", response));
    }

    @Operation(summary = "Get a post by id")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Post found"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Post not found")
    })
    @GetMapping("/{postId}")
    public ResponseEntity<ApiResponse<PostResponse>> getPost(
            @PathVariable Long postId,
            Authentication authentication) {
        PostResponse response = postService.getPostById(postId, SecurityUtils.extractUserId(authentication));
        return ResponseEntity.ok(ApiResponse.success("Post retrieved successfully", response));
    }

    @Operation(summary = "List the caller's own posts (paginated)")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "The caller's posts"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @GetMapping("/mine")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Page<PostResponse>>> getMyPosts(
            @AuthenticationPrincipal String userIdStr,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        UUID userId = UUID.fromString(userIdStr);
        Page<PostResponse> response = postService.getUserPosts(userId, userId, pageable);
        return ResponseEntity.ok(ApiResponse.success("User posts retrieved successfully", response));
    }

    @Operation(summary = "Get the caller's personalized feed", description = "Own posts + friends' USER_FEED posts + GROUP_POSTs from sport-matched groups, ordered by last interaction.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Feed page"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @GetMapping("/feed")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Page<PostResponse>>> getPersonalizedFeed(
            @AuthenticationPrincipal String userIdStr,
            @PageableDefault(size = 20, sort = "lastInteractionAt", direction = Sort.Direction.DESC) Pageable pageable) {
        Page<PostResponse> response = postService.getPersonalizedFeed(UUID.fromString(userIdStr), pageable);
        return ResponseEntity.ok(ApiResponse.success("Feed retrieved successfully", response));
    }

    @Operation(summary = "List active broadcasts for the caller's sport-matched groups")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Active broadcasts (possibly empty)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @GetMapping("/broadcast")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Page<PostResponse>>> getActiveBroadcasts(
            @AuthenticationPrincipal String userIdStr,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        Page<PostResponse> response = postService.getActiveBroadcasts(UUID.fromString(userIdStr), pageable);
        return ResponseEntity.ok(ApiResponse.success("Active broadcasts retrieved successfully", response));
    }

    @Operation(summary = "List a group's posts", description = "Membership-gated — the caller must belong to the group.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Group posts"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "Not a member of this group")
    })
    @GetMapping("/group/{groupId}")
    public ResponseEntity<ApiResponse<Page<PostResponse>>> getGroupPosts(
            @PathVariable Long groupId,
            Authentication authentication,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        Page<PostResponse> response = postService.getGroupPosts(groupId, SecurityUtils.extractUserId(authentication), pageable);
        return ResponseEntity.ok(ApiResponse.success("Group posts retrieved successfully", response));
    }

    @Operation(summary = "Update a post", description = "Ownership-gated — the caller must own the post (a non-owner gets 400, not 403 — see the actual service check).")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Post updated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Validation failed, or not the post owner"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Post not found")
    })
    @PutMapping("/{postId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<PostResponse>> updatePost(
            @PathVariable Long postId,
            @AuthenticationPrincipal String userIdStr,
            @Valid @RequestBody CreatePostRequest request) {
        PostResponse response = postService.updatePost(postId, UUID.fromString(userIdStr), request);
        return ResponseEntity.ok(ApiResponse.success("Post updated successfully", response));
    }

    @Operation(summary = "Extend or change a broadcast's end time", description = "GROUP_BROADCAST only, owner/admin only.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "End time updated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Validation failed, post isn't a GROUP_BROADCAST, not owner/admin, or end time not in the future"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Post not found")
    })
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

    @Operation(summary = "Delete a post", description = "Owner, or group owner/admin for GROUP_POST/GROUP_BROADCAST (a disallowed caller gets 400, not 403 — see the actual service check). Soft delete.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Post deleted"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "No permission to delete this post"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Post not found")
    })
    @DeleteMapping("/{postId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> deletePost(
            @PathVariable Long postId,
            @AuthenticationPrincipal String userIdStr) {
        postService.deletePost(postId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.success("Post deleted successfully", null));
    }

    @Operation(summary = "Like a post")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Liked"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Already liked, or post not found"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @PostMapping("/{postId}/like")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> likePost(
            @PathVariable Long postId,
            @AuthenticationPrincipal String userIdStr) {
        postService.likePost(postId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.success("Post liked successfully", null));
    }

    @Operation(summary = "Unlike a post")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Unliked"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not currently liked"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @DeleteMapping("/{postId}/like")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> unlikePost(
            @PathVariable Long postId,
            @AuthenticationPrincipal String userIdStr) {
        postService.unlikePost(postId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.success("Post unliked successfully", null));
    }

    @Operation(summary = "Comment on a post", description = "One level of nesting via parentCommentId (a reply to a reply is not rejected server-side, per A4).")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "Comment created"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Validation failed"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Post not found, or parentCommentId doesn't exist")
    })
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

    @Operation(summary = "List a post's root-level comments (paginated)", description = "A soft-deleted post's comments 404 rather than being returned.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Comments page"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Post not found or not active")
    })
    @GetMapping("/{postId}/comments")
    public ResponseEntity<ApiResponse<Page<CommentResponse>>> getPostComments(
            @PathVariable Long postId,
            Authentication authentication,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        Page<CommentResponse> response = commentService.getPostComments(postId, SecurityUtils.extractUserId(authentication), pageable);
        return ResponseEntity.ok(ApiResponse.success("Comments retrieved successfully", response));
    }

    @Operation(summary = "Delete a comment", description = "Ownership-gated (400, not 403, for a non-owner — see the actual service check). Soft delete.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Comment deleted"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not the comment owner"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Comment not found")
    })
    @DeleteMapping("/comments/{commentId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> deleteComment(
            @PathVariable Long commentId,
            @AuthenticationPrincipal String userIdStr) {
        commentService.deleteComment(commentId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.success("Comment deleted successfully", null));
    }

    @Operation(summary = "Like a comment")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Liked"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Already liked, or comment not found"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @PostMapping("/comments/{commentId}/like")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> likeComment(
            @PathVariable Long commentId,
            @AuthenticationPrincipal String userIdStr) {
        commentService.likeComment(commentId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.success("Comment liked successfully", null));
    }

    @Operation(summary = "Unlike a comment")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Unliked"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not currently liked"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @DeleteMapping("/comments/{commentId}/like")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> unlikeComment(
            @PathVariable Long commentId,
            @AuthenticationPrincipal String userIdStr) {
        commentService.unlikeComment(commentId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.success("Comment unliked successfully", null));
    }

    @Operation(summary = "List posts tagged with a hashtag (paginated)", security = {},
            description = "Public USER_FEED posts plus GROUP_POSTs from groups the caller belongs to (if authenticated).")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Posts page (possibly empty)")
    })
    @GetMapping("/hashtag/{tag}")
    public ResponseEntity<ApiResponse<Page<PostResponse>>> getPostsByHashtag(
            @PathVariable String tag,
            Authentication authentication,
            @PageableDefault(size = 20) Pageable pageable) {
        Page<PostResponse> response = postService.getPostsByHashtag(tag, SecurityUtils.extractUserId(authentication), pageable);
        return ResponseEntity.ok(ApiResponse.success("Posts retrieved successfully", response));
    }
}
