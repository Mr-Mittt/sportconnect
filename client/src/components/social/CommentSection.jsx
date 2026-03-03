import React, { useState, useEffect } from 'react';
import { Heart, Send, Loader2 } from 'lucide-react';
import api from '../../utils/api';

const CommentItem = ({ comment, currentUserId, onCommentLiked }) => {
  const [isLiked, setIsLiked] = useState(comment.isLikedByCurrentUser);
  const [likeCount, setLikeCount] = useState(comment.likeCount);

  const handleLike = async () => {
    try {
      if (isLiked) {
        await api.delete(`/posts/comments/${comment.id}/like?userId=${currentUserId}`);
      } else {
        await api.post(`/posts/comments/${comment.id}/like?userId=${currentUserId}`);
      }
      
      setIsLiked(!isLiked);
      setLikeCount(prev => isLiked ? prev - 1 : prev + 1);
    } catch (error) {
      console.error('Error toggling comment like:', error);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h`;
    return `${Math.floor(diffInSeconds / 86400)}d`;
  };

  return (
    <div className="flex gap-3 py-3">
      <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-teal-600 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
        {comment.userFullName?.charAt(0) || 'U'}
      </div>
      
      <div className="flex-1">
        <div className="bg-gray-100 rounded-lg px-3 py-2">
          <h4 className="font-semibold text-sm text-gray-900">
            {comment.userFullName || 'User'}
          </h4>
          <p className="text-gray-800 text-sm mt-1">{comment.content}</p>
        </div>
        
        <div className="flex items-center gap-4 mt-1 px-3">
          <button
            onClick={handleLike}
            className={`text-xs font-medium ${
              isLiked ? 'text-red-600' : 'text-gray-600 hover:text-red-600'
            }`}
          >
            {isLiked ? 'Liked' : 'Like'}
          </button>
          <span className="text-xs text-gray-500">{formatDate(comment.createdAt)}</span>
          {likeCount > 0 && (
            <span className="text-xs text-gray-600 flex items-center gap-1">
              <Heart className="w-3 h-3 fill-current text-red-600" />
              {likeCount}
            </span>
          )}
        </div>

        {/* Replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-2 ml-4 space-y-2">
            {comment.replies.map(reply => (
              <CommentItem
                key={reply.id}
                comment={reply}
                currentUserId={currentUserId}
                onCommentLiked={onCommentLiked}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const CommentSection = ({ postId, currentUserId, onCommentAdded }) => {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchComments();
  }, [postId]);

  const fetchComments = async () => {
    try {
      const response = await api.get(
        `/posts/${postId}/comments?currentUserId=${currentUserId}&page=0&size=20`
      );
      
      setComments(response.data.data.content || []);
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!newComment.trim()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await api.post(`/posts/${postId}/comments?userId=${currentUserId}`, {
        content: newComment.trim(),
      });

      setComments(prev => [response.data.data, ...prev]);
      setNewComment('');
      if (onCommentAdded) {
        onCommentAdded();
      }
    } catch (error) {
      console.error('Error posting comment:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4">
      {/* Comment Input */}
      <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
          U
        </div>
        <div className="flex-1 flex gap-2">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Write a comment..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isSubmitting}
            maxLength="1000"
          />
          <button
            type="submit"
            disabled={!newComment.trim() || isSubmitting}
            className="px-4 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </form>

      {/* Comments List */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-center text-gray-500 py-8">No comments yet. Be the first to comment!</p>
      ) : (
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {comments.map(comment => (
            <CommentItem
              key={comment.id}
              comment={comment}
              currentUserId={currentUserId}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default CommentSection;
