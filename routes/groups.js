const express = require('express');
const router = express.Router();
const wasenderApi = require('../utils/wasenderApi');

const filterAdminGroups = async (groups, userInfo) => {
  const adminGroups = [];
  
  for (const group of groups) {
    try {
      const metadata = await wasenderApi.getGroupMetadata(group.id || group.jid);
      const participants = metadata.participants || [];
      
      const userParticipant = participants.find(p => 
        p.id === userInfo.jid || p.jid === userInfo.jid
      );
      
      if (userParticipant && (userParticipant.admin === 'admin' || userParticipant.isAdmin)) {
        adminGroups.push({
          id: group.id || group.jid,
          name: group.name || metadata.subject,
          description: metadata.desc || group.description,
          participantsCount: participants.length,
          createdAt: metadata.creation || group.createdAt,
          ...metadata
        });
      }
    } catch (error) {
      console.error(`Error fetching metadata for group ${group.id || group.jid}:`, error.message);
    }
  }
  
  return adminGroups;
};

router.get('/admin', async (req, res) => {
  try {
    // Check for connected session
    const sessionsResponse = await wasenderApi.getAllSessions();
    const sessions = sessionsResponse.data || [];
    const connectedSession = sessions.find(session => session.status === 'connected');
    
    if (!connectedSession) {
      return res.status(401).json({
        status: 'error',
        message: 'No active WhatsApp session. Please login first.'
      });
    }
    
    const groupsResponse = await wasenderApi.getAllGroups();
    const allGroups = groupsResponse.data || [];
    
    // For now, return all groups since the user is authenticated
    // We can implement admin filtering later if needed
    const formattedGroups = allGroups.map(group => ({
      id: group.id || group.jid,
      name: group.name || group.subject || 'Unnamed Group',
      description: group.description || group.desc || '',
      participantsCount: group.participants ? group.participants.length : 0,
      createdAt: group.createdAt || group.creation || new Date().toISOString()
    }));
    
    res.status(200).json({
      status: 'success',
      data: {
        totalGroups: formattedGroups.length,
        groups: formattedGroups
      }
    });
  } catch (error) {
    res.status(error.status || 500).json({
      status: 'error',
      message: error.message || 'Failed to fetch admin groups'
    });
  }
});

router.get('/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    
    const metadata = await wasenderApi.getGroupMetadata(groupId);
    
    res.status(200).json({
      status: 'success',
      data: metadata
    });
  } catch (error) {
    res.status(error.status || 500).json({
      status: 'error',
      message: error.message || 'Failed to fetch group details'
    });
  }
});

router.get('/:groupId/participants', async (req, res) => {
  try {
    const { groupId } = req.params;
    
    const participants = await wasenderApi.getGroupParticipants(groupId);
    
    res.status(200).json({
      status: 'success',
      data: {
        totalParticipants: participants.length,
        participants: participants
      }
    });
  } catch (error) {
    res.status(error.status || 500).json({
      status: 'error',
      message: error.message || 'Failed to fetch group participants'
    });
  }
});

module.exports = router;