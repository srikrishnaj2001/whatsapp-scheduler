const express = require('express');
const router = express.Router();
const wasenderApi = require('../utils/wasenderApi');

router.get('/', async (req, res) => {
  try {
    // Check if user has been logged out via express session
    if (req.session && req.session.loggedOut) {
      return res.render('login');
    }
    
    const sessionsResponse = await wasenderApi.getAllSessions();
    const sessions = sessionsResponse.data || [];
    const connectedSession = sessions.find(session => session.status === 'connected');
    
    if (connectedSession) {
      return res.redirect('/dashboard');
    }
    
    res.render('login');
  } catch (error) {
    res.render('login');
  }
});

router.get('/dashboard', async (req, res) => {
  try {
    // Check if user has been logged out via express session
    if (req.session && req.session.loggedOut) {
      return res.redirect('/');
    }
    
    const sessionsResponse = await wasenderApi.getAllSessions();
    const sessions = sessionsResponse.data || [];
    const connectedSession = sessions.find(session => session.status === 'connected');
    
    if (!connectedSession) {
      return res.redirect('/');
    }
    
    const userInfo = {
      phoneNumber: connectedSession.phone_number,
      name: connectedSession.name,
      jid: connectedSession.phone_number,
      status: connectedSession.status
    };
    
    res.render('dashboard', { user: userInfo });
  } catch (error) {
    res.redirect('/');
  }
});

module.exports = router;