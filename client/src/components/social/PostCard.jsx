import React, { useState } from 'react';
import { Heart, MessageCircle, Share2, MapPin, MoreVertical, Trash2, Edit } from 'lucide-react';
import CommentSection from './CommentSection';
import api from '../../utils/api';

const PostCard = ({ post, currentUserId, onPostDeleted, onPostUpdated }) => {
  const [showComments, setShowComments] = useState(false);
  const [isLiked, setIsLiked] = useState(post.isLikedByCurrentUser);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [showMenu, setShowMenu] = useState(false);

  const handleLike = async () => {
    try {
      if (isLiked) {
        await api.delete(`/posts/${post.id}/like?userId=${currentUserId}`);
      } else {
        await api.post(`/posts/${post.id}/like?userId=${currentUserId}`);
      }
      
      setIsLiked(!isLiked);
      setLikeCount(prev => isLiked ? prev - 1 : prev + 1);
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this post?')) {
      return;
    }

    try {
      await api.delete(`/posts/${post.id}?userId=${currentUserId}`);
      
      if (onPostDeleted) {
        onPostDeleted(post.id);
      }
    } catch (error) {
      console.error('Error deleting post:', error);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const isOwnPost = post.userId === currentUserId;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-4">
      {/* Post Header */}
      <div className="p-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
            {post.userFullName?.charAt(0) || 'U'}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{post.userFullName || 'User'}</h3>
            <p className="text-sm text-gray-500">{formatDate(post.createdAt)}</p>
          </div>
        </div>

        {isOwnPost && (
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <MoreVertical className="w-5 h-5 text-gray-600" />
            </button>
            
            {showMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                <button
                  onClick={handleDelete}
                  className="w-full px-4 py-2 text-left text-red-600 hover:bg-red-50 flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Post
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Post Content */}
      <div className="px-4 pb-3">
        <p className="text-gray-800 whitespace-pre-wrap">{post.content}</p>
        
        {post.locationName && (
          <div className="flex items-center gap-1 mt-2 text-gray-600">
            <MapPin className="w-4 h-4" />
            <span className="text-sm">{post.locationName}</span>
          </div>
        )}
      </div>

      {/* Post Media */}
      {post.media && post.media.length > 0 && (
        <div className="px-4 pb-3">
          <div className="grid grid-cols-2 gap-2">
            {post.media.map((media, index) => (
              <img
                key={media.id || index}
                src={media.mediaUrl}
                alt={`Post media ${index + 1}`}
                className="w-full h-64 object-cover rounded-lg"
              />
            ))}
          </div>
        </div>
      )}

      {/* Post Stats */}
      <div className="px-4 py-2 border-t border-gray-200 flex items-center justify-between text-sm text-gray-600">
        <span>{likeCount} {likeCount === 1 ? 'like' : 'likes'}</span>
        <span>{commentCount} {commentCount === 1 ? 'comment' : 'comments'}</span>
      </div>

      {/* Action Buttons */}
      <div className="px-4 py-2 border-t border-gray-200 flex items-center gap-2">
        <button
          onClick={handleLike}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-medium transition-colors ${
            isLiked
              ? 'text-red-600 bg-red-50 hover:bg-red-100'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
          <span>Like</span>
        </button>

        <button
          onClick={() => setShowComments(!showComments)}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-medium text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <MessageCircle className="w-5 h-5" />
          <span>Comment</span>
        </button>

        <button className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-medium text-gray-600 hover:bg-gray-100 transition-colors">
          <Share2 className="w-5 h-5" />
          <span>Share</span>
        </button>
      </div>

      {/* Comments Section */}
      {showComments && (
        <div className="border-t border-gray-200">
          <CommentSection
            postId={post.id}
            currentUserId={currentUserId}
            onCommentAdded={() => setCommentCount(prev => prev + 1)}
          />
        </div>
      )}
    </div>
  );
};

export default PostCard;
