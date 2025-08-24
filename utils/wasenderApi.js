const axios = require('axios');

const API_BASE_URL = process.env.WASENDER_API_BASE_URL || 'https://wasenderapi.com/api';
const API_KEY = process.env.WASENDER_API_KEY;

const createApiClient = (apiKey = API_KEY) => {
  return axios.create({
    baseURL: API_BASE_URL,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    timeout: 30000
  });
};

const apiClient = createApiClient();

// Function to get session-specific API client
const getSessionApiClient = async () => {
  try {
    const response = await apiClient.get('/whatsapp-sessions');
    const sessions = response.data.data || [];
    const connectedSession = sessions.find(session => session.status === 'connected');
    
    if (connectedSession && connectedSession.api_key) {
      return createApiClient(connectedSession.api_key);
    }
    
    return apiClient; // Fallback to default client
  } catch (error) {
    return apiClient; // Fallback to default client
  }
};

const handleApiError = (error) => {
  if (error.response) {
    const { status, data } = error.response;
    throw {
      status,
      message: data.message || `API Error: ${status}`,
      data: data
    };
  } else if (error.request) {
    throw {
      status: 503,
      message: 'Service unavailable. Please try again later.'
    };
  } else {
    throw {
      status: 500,
      message: error.message || 'Internal server error'
    };
  }
};

// Helper utilities to resolve a session identifier (prefer numeric ID if available)
const isNumericId = (value) => {
  if (typeof value === 'number') return true;
  if (typeof value !== 'string') return false;
  return /^\d+$/.test(value.trim());
};

const getSessionByName = async (name) => {
  const response = await apiClient.get('/whatsapp-sessions');
  const sessions = response.data.data || [];
  return sessions.find(s => s.name === name || s.slug === name) || null;
};

const resolveSessionIdentifier = async (identifier) => {
  if (isNumericId(identifier)) return String(identifier);
  const session = await getSessionByName(String(identifier));
  return session ? String(session.id) : String(identifier);
};

const wasenderApi = {
  getAllSessions: async () => {
    try {
      const response = await apiClient.get('/whatsapp-sessions');
      return response.data;
    } catch (error) {
      handleApiError(error);
    }
  },

  createSession: async (sessionName, phoneNumber = null) => {
    try {
      const sessionData = {
        name: sessionName,
        phone_number: phoneNumber || '+919876543210',
        webhook_url: '',
        webhook_events: ['messages.upsert'],
        account_protection: true,
        log_messages: true
      };
      
      const response = await apiClient.post('/whatsapp-sessions', sessionData);
      return response.data;
    } catch (error) {
      handleApiError(error);
    }
  },

  connectSession: async (sessionIdentifier) => {
    try {
      const idOrName = await resolveSessionIdentifier(sessionIdentifier);
      try {
        const response = await apiClient.post(`/whatsapp-sessions/${idOrName}/connect`);
        return response.data;
      } catch (primaryError) {
        // Fallback: if we resolved to an ID and it failed, attempt original identifier
        if (String(idOrName) !== String(sessionIdentifier)) {
          const response = await apiClient.post(`/whatsapp-sessions/${sessionIdentifier}/connect`);
          return response.data;
        }
        throw primaryError;
      }
    } catch (error) {
      handleApiError(error);
    }
  },

  connectAndGetQRCode: async (sessionIdentifier) => {
    try {
      const idOrName = await resolveSessionIdentifier(sessionIdentifier);
      try {
        const response = await apiClient.post(`/whatsapp-sessions/${idOrName}/connect`);
        // The connect endpoint returns both status and QR code
        return {
          status: response.data.data?.status || response.data.status,
          qrCode: response.data.data?.qrCode || response.data.qrCode || response.data.qr
        };
      } catch (primaryError) {
        if (String(idOrName) !== String(sessionIdentifier)) {
          const response = await apiClient.post(`/whatsapp-sessions/${sessionIdentifier}/connect`);
          return {
            status: response.data.data?.status || response.data.status,
            qrCode: response.data.data?.qrCode || response.data.qrCode || response.data.qr
          };
        }
        throw primaryError;
      }
    } catch (error) {
      handleApiError(error);
    }
  },

  getQRCode: async (sessionIdentifier) => {
    try {
      const idOrName = await resolveSessionIdentifier(sessionIdentifier);
      try {
        const response = await apiClient.get(`/whatsapp-sessions/${idOrName}/qrcode`);
        return {
          qrCode: response.data.qrCode || response.data.qr || response.data
        };
      } catch (primaryError) {
        if (String(idOrName) !== String(sessionIdentifier)) {
          const response = await apiClient.get(`/whatsapp-sessions/${sessionIdentifier}/qrcode`);
          return {
            qrCode: response.data.qrCode || response.data.qr || response.data
          };
        }
        throw primaryError;
      }
    } catch (error) {
      handleApiError(error);
    }
  },

  getSessionDetails: async (sessionName) => {
    try {
      const response = await apiClient.get(`/whatsapp-sessions/${sessionName}`);
      return response.data;
    } catch (error) {
      handleApiError(error);
    }
  },

  getSessionStatus: async () => {
    try {
      const response = await apiClient.get('/status');
      return response.data;
    } catch (error) {
      handleApiError(error);
    }
  },

  getUserInfo: async () => {
    try {
      const response = await apiClient.get('/user');
      return response.data;
    } catch (error) {
      handleApiError(error);
    }
  },

  disconnectSession: async (sessionIdentifier) => {
    try {
      const idOrName = await resolveSessionIdentifier(sessionIdentifier);
      try {
        const response = await apiClient.post(`/whatsapp-sessions/${idOrName}/disconnect`);
        return response.data;
      } catch (primaryError) {
        if (String(idOrName) !== String(sessionIdentifier)) {
          const response = await apiClient.post(`/whatsapp-sessions/${sessionIdentifier}/disconnect`);
          return response.data;
        }
        throw primaryError;
      }
    } catch (error) {
      handleApiError(error);
    }
  },

  deleteSession: async (sessionIdentifier) => {
    try {
      const idOrName = await resolveSessionIdentifier(sessionIdentifier);
      try {
        const response = await apiClient.delete(`/whatsapp-sessions/${idOrName}`);
        return response.data;
      } catch (primaryError) {
        if (String(idOrName) !== String(sessionIdentifier)) {
          const response = await apiClient.delete(`/whatsapp-sessions/${sessionIdentifier}`);
          return response.data;
        }
        throw primaryError;
      }
    } catch (error) {
      handleApiError(error);
    }
  },

  getAllGroups: async () => {
    try {
      const sessionClient = await getSessionApiClient();
      const response = await sessionClient.get('/groups');
      return response.data;
    } catch (error) {
      handleApiError(error);
    }
  },

  getGroupMetadata: async (groupJid) => {
    try {
      const response = await apiClient.get(`/groups/${groupJid}/metadata`);
      return response.data;
    } catch (error) {
      handleApiError(error);
    }
  },

  getGroupParticipants: async (groupJid) => {
    try {
      const response = await apiClient.get(`/groups/${groupJid}/participants`);
      return response.data;
    } catch (error) {
      handleApiError(error);
    }
  },

  sendMessage: async (messageData) => {
    try {
      const sessionClient = await getSessionApiClient();
      const response = await sessionClient.post('/send-message', messageData);
      return response.data;
    } catch (error) {
      handleApiError(error);
    }
  }
};

module.exports = wasenderApi;