import React, { useState } from 'react';
import { Users, Plus, Search, Home } from 'lucide-react';
import { useGroup } from '../../context/GroupContext';
import CreateGroupModal from './CreateGroupModal';
import JoinGroupModal from './JoinGroupModal';

const GroupSidebar = () => {
  const { userGroups, selectedSpace, selectedGroupId, selectSpace } = useGroup();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  const handleSpaceClick = (space, groupId = null) => {
    selectSpace(space, groupId);
  };

  return (
    <>
      <div className="w-64 bg-white border-r border-gray-200 h-full overflow-y-auto">
        <div className="p-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Spaces</h2>

          {/* User's Space */}
          <div
            onClick={() => handleSpaceClick('user')}
            className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors mb-2 ${
              selectedSpace === 'user'
                ? 'bg-blue-50 text-blue-600'
                : 'hover:bg-gray-50 text-gray-700'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="font-medium">User's Space</span>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200 my-4"></div>

          {/* Group Spaces Header */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-600 uppercase">
              Group Spaces
            </h3>
            <span className="text-xs text-gray-500">
              {userGroups.length}
            </span>
          </div>

          {/* User's Groups */}
          <div className="space-y-1 mb-4">
            {userGroups.length === 0 ? (
              <p className="text-sm text-gray-500 italic py-2">
                No groups yet
              </p>
            ) : (
              userGroups.map((group) => (
                <div
                  key={group.id}
                  onClick={() => handleSpaceClick('group', group.id)}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedSpace === 'group' && selectedGroupId === group.id
                      ? 'bg-blue-50 text-blue-600'
                      : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-semibold text-sm">
                    {group.groupName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{group.groupName}</p>
                    <p className="text-xs text-gray-500">
                      {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
                    </p>
                  </div>
                  {group.currentUserRole === 'group_owner' && (
                    <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                      Owner
                    </span>
                  )}
                  {group.currentUserRole === 'group_admin' && (
                    <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">
                      Admin
                    </span>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200 my-4"></div>

          {/* Action Buttons */}
          <div className="space-y-2">
            <button
              onClick={() => setShowJoinModal(true)}
              className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors"
            >
              <Search className="w-5 h-5" />
              <span className="font-medium">Join Group</span>
            </button>

            <button
              onClick={() => setShowCreateModal(true)}
              className="w-full flex items-center gap-3 p-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              <Plus className="w-5 h-5" />
              <span className="font-medium">Create Group</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateGroupModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {showJoinModal && (
        <JoinGroupModal
          isOpen={showJoinModal}
          onClose={() => setShowJoinModal(false)}
        />
      )}
    </>
  );
};

export default GroupSidebar;
