import React, { createContext, useContext, useState, useCallback } from 'react';
import api from '../utils/api';

const GroupContext = createContext();

export const useGroup = () => {
  const context = useContext(GroupContext);
  if (!context) {
    throw new Error('useGroup must be used within a GroupProvider');
  }
  return context;
};

export const GroupProvider = ({ children }) => {
  const [userGroups, setUserGroups] = useState([]);
  const [selectedSpace, setSelectedSpace] = useState('user'); // 'user' or 'group'
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch user's groups
  const fetchUserGroups = useCallback(async (userId) => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/groups/user/${userId}?page=0&size=100`);
      setUserGroups(response.data.data.content || []);
    } catch (err) {
      console.error('Error fetching user groups:', err);
      setError('Failed to load groups');
    } finally {
      setLoading(false);
    }
  }, []);

  // Create a new group
  const createGroup = useCallback(async (userId, groupData) => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.post(`/groups?userId=${userId}`, groupData);
      const newGroup = response.data.data;
      setUserGroups(prev => [...prev, newGroup]);
      return newGroup;
    } catch (err) {
      console.error('Error creating group:', err);
      setError(err.response?.data?.message || 'Failed to create group');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Join a group (create join request)
  const joinGroup = useCallback(async (userId, groupName, message) => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.post(`/groups/join-requests?userId=${userId}`, {
        groupName,
        message
      });
      return response.data.data;
    } catch (err) {
      console.error('Error joining group:', err);
      setError(err.response?.data?.message || 'Failed to send join request');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Leave a group
  const leaveGroup = useCallback(async (groupId, userId) => {
    try {
      setLoading(true);
      setError(null);
      await api.delete(`/groups/${groupId}/leave?userId=${userId}`);
      setUserGroups(prev => prev.filter(g => g.id !== groupId));
      if (selectedGroupId === groupId) {
        setSelectedSpace('user');
        setSelectedGroupId(null);
      }
    } catch (err) {
      console.error('Error leaving group:', err);
      setError(err.response?.data?.message || 'Failed to leave group');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [selectedGroupId]);

  // Select a space (user's space or specific group)
  const selectSpace = useCallback((space, groupId = null) => {
    setSelectedSpace(space);
    setSelectedGroupId(groupId);
  }, []);

  // Get current space info
  const getCurrentSpace = useCallback(() => {
    if (selectedSpace === 'user') {
      return { type: 'user', name: "User's Space", id: null };
    }
    const group = userGroups.find(g => g.id === selectedGroupId);
    return { 
      type: 'group', 
      name: group?.groupName || 'Unknown Group', 
      id: selectedGroupId,
      group 
    };
  }, [selectedSpace, selectedGroupId, userGroups]);

  const value = {
    // State
    userGroups,
    selectedSpace,
    selectedGroupId,
    loading,
    error,

    // Actions
    fetchUserGroups,
    createGroup,
    joinGroup,
    leaveGroup,
    selectSpace,
    getCurrentSpace,
    setError
  };

  return (
    <GroupContext.Provider value={value}>
      {children}
    </GroupContext.Provider>
  );
};
