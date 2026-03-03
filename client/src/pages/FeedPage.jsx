import React from 'react';
import { useAuth } from '../context/AuthContext';
import SocialFeed from '../components/social/SocialFeed';

const FeedPage = () => {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <SocialFeed currentUserId={user?.id} />
    </div>
  );
};

export default FeedPage;
