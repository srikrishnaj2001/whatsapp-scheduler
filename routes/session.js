const express = require('express');
const router = express.Router();
const wasenderApi = require('../utils/wasenderApi');
const QRCode = require('qrcode');

const getSessionName = () => {
  const baseName = process.env.WHATSAPP_SESSION_NAME || 'default_session';
  const timestamp = Date.now();
  return `${baseName}_${timestamp}`;
};

router.post('/qr-code', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({
        status: 'error',
        message: 'Phone number is required'
      });
    }
    
    // Check if session exists and user is logged in
    const hasActiveSession = req.session && req.session.isLoggedIn;
    console.log('QR Code request - hasActiveSession:', hasActiveSession);
    
    // Get all existing sessions first
    const sessionsResponse = await wasenderApi.getAllSessions();
    const sessions = sessionsResponse.data || [];
    console.log('Found sessions:', sessions.map(s => ({ name: s.name, status: s.status })));
    
    // Check if there's already a connected session AND user has active session
    const connectedSession = sessions.find(session => session.status === 'connected');
    console.log('Connected session:', connectedSession ? connectedSession.name : 'none');
    
    if (connectedSession && hasActiveSession) {
      console.log('Returning already connected response');
      return res.status(200).json({
        status: 'success',
        data: {
          alreadyConnected: true,
          sessionName: connectedSession.name,
          phoneNumber: connectedSession.phone_number
        }
      });
    }
    
    console.log('Proceeding with session connection/creation');
    
    let sessionToUse = null;
    
    // Simplified approach: Delete all existing sessions and start fresh
    console.log('Cleaning up existing sessions...');
    for (const session of sessions) {
      try {
        // Try deleting by ID first, then by name as fallback
        try {
          await wasenderApi.deleteSession(session.id.toString());
          console.log(`Deleted session by ID: ${session.id}`);
        } catch (idError) {
          await wasenderApi.deleteSession(session.name);
          console.log(`Deleted session by name: ${session.name}`);
        }
      } catch (deleteError) {
        console.log(`Could not delete session ${session.name}:`, deleteError.message);
      }
    }
    
    // Wait a moment for deletion to process
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Create a fresh session
    console.log('Creating fresh session...');
    const sessionName = getSessionName();
    await wasenderApi.createSession(sessionName, phoneNumber);
    sessionToUse = sessionName;
    console.log(`Created fresh session: ${sessionToUse}`);
    
    // Wait a moment for creation to process
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Use the connect endpoint to get QR code directly
    const connectData = await wasenderApi.connectAndGetQRCode(sessionToUse);
    console.log('Connect response:', connectData);

    // Convert QR token/text to a Data URL image for the frontend <img>
    let qrImageDataUrl = null;
    try {
      const qrToken = connectData.qrCode;
      if (typeof qrToken === 'string' && qrToken.length > 0) {
        qrImageDataUrl = await QRCode.toDataURL(qrToken, { margin: 1, width: 256 });
      } else {
        // Fallback: explicitly request QR and encode if needed
        const qrResp = await wasenderApi.getQRCode(sessionToUse);
        const raw = qrResp && qrResp.qrCode;
        if (typeof raw === 'string' && raw.length > 0) {
          qrImageDataUrl = raw.startsWith('data:') ? raw : await QRCode.toDataURL(raw, { margin: 1, width: 256 });
        }
      }
    } catch (encodeErr) {
      console.error('QR encoding failed:', encodeErr.message || encodeErr);
    }
    
    // Create new session for successful QR generation
    req.session.isLoggedIn = true;
    
    res.status(200).json({
      status: 'success',
      data: {
        qrCode: qrImageDataUrl,
        qrToken: connectData.qrCode,
        sessionName: sessionToUse,
        sessionStatus: connectData.status
      }
    });
  } catch (error) {
    console.error('QR Code generation error:', error);
    res.status(error.status || 500).json({
      status: 'error',
      message: error.message || 'Failed to generate QR code'
    });
  }
});

router.get('/status', async (req, res) => {
  try {
    // Check if session exists (not destroyed)
    if (!req.session) {
      return res.status(200).json({
        status: 'success',
        data: {
          isLoggedIn: false,
          sessionName: 'no_session'
        }
      });
    }
    
    // Check if user has been logged out via express session
    if (req.session.loggedOut) {
      return res.status(200).json({
        status: 'success',
        data: {
          isLoggedIn: false,
          sessionName: 'logged_out'
        }
      });
    }
    
    // Get all existing sessions to check status
    const sessionsResponse = await wasenderApi.getAllSessions();
    const sessions = sessionsResponse.data || [];
    
    // Find a connected session
    const connectedSession = sessions.find(session => session.status === 'connected');
    
    if (connectedSession) {
      // Only show as logged in if user has an active express session
      if (req.session && req.session.isLoggedIn) {
        // Mark user info in express session
        req.session.currentUser = {
          phoneNumber: connectedSession.phone_number,
          name: connectedSession.name,
          sessionName: connectedSession.name
        };
        
        res.status(200).json({
          status: 'success',
          data: {
            isLoggedIn: true,
            sessionName: connectedSession.name,
            user: {
              phoneNumber: connectedSession.phone_number,
              name: connectedSession.name,
              status: connectedSession.status
            }
          }
        });
      } else {
        // Wasender session exists but user hasn't logged in through our app
        res.status(200).json({
          status: 'success',
          data: {
            isLoggedIn: false,
            sessionName: 'not_authenticated'
          }
        });
      }
    } else {
      res.status(200).json({
        status: 'success',
        data: {
          isLoggedIn: false,
          sessionName: sessions.length > 0 ? sessions[0].name : getSessionName()
        }
      });
    }
  } catch (error) {
    res.status(error.status || 500).json({
      status: 'error',
      message: error.message || 'Failed to check session status'
    });
  }
});

router.post('/logout', async (req, res) => {
  try {
    // Best effort: disconnect and delete all Wasender sessions
    try {
      const sessionsResponse = await wasenderApi.getAllSessions();
      const sessions = sessionsResponse.data || [];
      for (const s of sessions) {
        try {
          await wasenderApi.disconnectSession(s.id?.toString?.() || s.name);
        } catch (e) {
          // ignore if already disconnected or not found
        }
        try {
          await wasenderApi.deleteSession(s.id?.toString?.() || s.name);
        } catch (e) {
          // ignore if already deleted or not found
        }
      }
    } catch (cleanupErr) {
      console.warn('Wasender cleanup on logout failed:', cleanupErr.message || cleanupErr);
    }

    // Destroy the express session
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destruction error:', err);
      }
    });

    res.status(200).json({
      status: 'success',
      message: 'Successfully logged out'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(200).json({
      status: 'success',
      message: 'Logged out from application'
    });
  }
});

module.exports = router;