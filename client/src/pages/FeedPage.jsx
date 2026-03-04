import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { GroupProvider, useGroup } from '../context/GroupContext';
import SocialFeed from '../components/social/SocialFeed';
import GroupSidebar from '../components/group/GroupSidebar';

const FeedPageContent = () => {
  const { user } = useAuth();
  const { fetchUserGroups, getCurrentSpace } = useGroup();

  useEffect(() => {
    if (user?.id) {
      fetchUserGroups(user.id);
    }
  }, [user?.id, fetchUserGroups]);

  const currentSpace = getCurrentSpace();

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Left Sidebar - Group Navigation */}
      <GroupSidebar />

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto py-6 px-4">
          {/* Space Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">
              {currentSpace.name}
            </h1>
            {currentSpace.type === 'group' && currentSpace.group && (
              <p className="text-sm text-gray-600 mt-1">
                {currentSpace.group.memberCount} members • {currentSpace.group.currentUserRole?.replace('group_', '')}
              </p>
            )}
          </div>

          {/* Social Feed */}
          <SocialFeed 
            currentUserId={user?.id} 
            groupId={currentSpace.type === 'group' ? currentSpace.id : null}
          />
        </div>
      </div>
    </div>
  );
};

const FeedPage = () => {
  return (
    <GroupProvider>
      <FeedPageContent />
    </GroupProvider>
  );
};

export default FeedPage;
