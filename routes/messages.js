const express = require('express');
const router = express.Router();
const wasenderApi = require('../utils/wasenderApi');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');
const scheduler = require('../utils/scheduler');
const awsScheduler = require('../utils/awsScheduler');
const crypto = require('crypto');
const awsEventBridgeRules = require('../utils/awsEventBridgeRules');

// Force in-memory scheduler when set (USE_IN_MEMORY_SCHEDULER=true or SCHEDULER_MODE=memory)
const FORCE_MEMORY_SCHEDULER = (process.env.USE_IN_MEMORY_SCHEDULER === 'true' || process.env.SCHEDULER_MODE === 'memory');

const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowedMimetypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimetypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'));
    }
  }
});

const uploadImageToCloud = async (filePath) => {
  const fileBuffer = await fs.readFile(filePath);
  const base64Data = fileBuffer.toString('base64');
  const mimeType = 'image/' + path.extname(filePath).slice(1);
  return `data:${mimeType};base64,${base64Data}`;
};

// Simple HMAC signer/verifier for callbacks
const SIGNING_SECRET = process.env.SIGNING_SECRET || 'dev-secret';
function computeSignature(bodyString) {
  return crypto.createHmac('sha256', SIGNING_SECRET).update(bodyString).digest('hex');
}
function verifySignature(req) {
  const sig = req.headers['x-signature'];
  if (!sig) return false;
  const bodyString = JSON.stringify(req.body || {});
  return sig === computeSignature(bodyString);
}

// SEND-NOW ENDPOINT used by UI and EventBridge callback
router.post('/send', async (req, res) => {
  try {
    const { groupIds, message } = req.body;
    if (!groupIds || !Array.isArray(groupIds) || groupIds.length === 0) {
      return res.status(400).json({ status: 'error', message: 'Group IDs array is required' });
    }
    if (!message) {
      return res.status(400).json({ status: 'error', message: 'Message is required' });
    }

    // If coming from EventBridge, header should include valid signature
    if (req.headers['x-event-source'] === 'eventbridge') {
      if (!verifySignature(req)) {
        return res.status(401).json({ status: 'error', message: 'Invalid signature' });
      }
    }

    // Check for connected session
    const sessionsResponse = await wasenderApi.getAllSessions();
    const sessions = sessionsResponse.data || [];
    const connectedSession = sessions.find(session => session.status === 'connected');
    if (!connectedSession) {
      return res.status(401).json({ status: 'error', message: 'No active WhatsApp session. Please login first.' });
    }

    const results = [];
    const errors = [];
    for (const groupId of groupIds) {
      try {
        const result = await wasenderApi.sendMessage({ to: groupId, text: message });
        results.push({ groupId, status: 'success', data: result });
        await new Promise(resolve => setTimeout(resolve, 800));
      } catch (err) {
        errors.push({ groupId, status: 'error', message: err.message });
      }
    }
    return res.status(200).json({ status: 'success', data: { totalGroups: groupIds.length, successful: results.length, failed: errors.length, results, errors } });
  } catch (error) {
    return res.status(error.status || 500).json({ status: 'error', message: error.message || 'Failed to send message' });
  }
});

// SCHEDULE ENDPOINT that creates EventBridge Scheduler job to POST back to /send
router.post('/schedule', async (req, res) => {
  try {
    const { groupIds, message, scheduledAt } = req.body;
    if (!groupIds || !Array.isArray(groupIds) || groupIds.length === 0) {
      return res.status(400).json({ status: 'error', message: 'Group IDs array is required' });
    }
    if (!message) {
      return res.status(400).json({ status: 'error', message: 'Message is required' });
    }
    if (!scheduledAt) {
      return res.status(400).json({ status: 'error', message: 'scheduledAt (ISO datetime) is required' });
    }
    const runAt = new Date(scheduledAt);
    if (isNaN(runAt.getTime())) {
      return res.status(400).json({ status: 'error', message: 'Invalid scheduledAt' });
    }

    const callbackPayload = { groupIds, message, scheduled: true };
    const isoUtc = runAt.toISOString();

    if (!FORCE_MEMORY_SCHEDULER && process.env.AWS_API_DESTINATION_ARN && process.env.AWS_SCHEDULER_ROLE_ARN) {
      try {
        // Preferred: Scheduler one-time schedule
        await awsScheduler.createOneTimeSchedule({
          name: `wa-send-${Date.now()}`,
          runAtIsoUtc: isoUtc,
          payloadJson: JSON.stringify(callbackPayload),
          description: 'WhatsApp group broadcast'
        });
        return res.status(200).json({ status: 'success', message: 'Scheduled via EventBridge Scheduler', data: { runAt: isoUtc } });
      } catch (err) {
        // If ARN format not accepted by Scheduler, fallback to Rule + API Destination
        if (err?.name === 'ValidationException' && /Provided Arn is not in correct format/i.test(err?.message || '')) {
          const result = await awsEventBridgeRules.scheduleApiDestination({
            baseName: 'wa-send',
            isoUtc,
            apiDestinationArn: process.env.AWS_API_DESTINATION_ARN,
            roleArn: process.env.AWS_SCHEDULER_ROLE_ARN,
            payload: callbackPayload
          });
          return res.status(200).json({ status: 'success', message: 'Scheduled via EventBridge Rule', data: result });
        }
        throw err;
      }
    } else {
      const job = scheduler.scheduleBroadcast({ groupIds, message, runAtMs: runAt.getTime() });
      return res.status(200).json({ status: 'success', message: 'Scheduled (in-memory)', data: job });
    }
  } catch (error) {
    console.error('Schedule error:', error);
    const status = error?.$metadata?.httpStatusCode || 500;
    const detail = error?.message || 'Failed to schedule';
    return res.status(status).json({ status: 'error', message: detail, data: { code: error?.name, httpStatus: status } });
  }
});

router.post('/text', async (req, res) => {
  try {
    const { groupId, message } = req.body;
    
    if (!groupId || !message) {
      return res.status(400).json({
        status: 'error',
        message: 'Group ID and message are required'
      });
    }
    
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
    
    const messageData = {
      to: groupId,
      text: message
    };
    
    const result = await wasenderApi.sendMessage(messageData);
    
    res.status(200).json({
      status: 'success',
      message: 'Message sent successfully',
      data: result
    });
  } catch (error) {
    res.status(error.status || 500).json({
      status: 'error',
      message: error.message || 'Failed to send message'
    });
  }
});

// Schedule a broadcast at a future time
router.post('/broadcast/schedule', async (req, res) => {
  try {
    const { groupIds, message, scheduleAt } = req.body;
    if (!groupIds || !Array.isArray(groupIds) || groupIds.length === 0) {
      return res.status(400).json({ status: 'error', message: 'Group IDs array is required' });
    }
    if (!message) {
      return res.status(400).json({ status: 'error', message: 'Message is required' });
    }
    if (!scheduleAt) {
      return res.status(400).json({ status: 'error', message: 'scheduleAt (ISO datetime) is required' });
    }
    const runAt = new Date(scheduleAt);
    if (isNaN(runAt.getTime())) {
      return res.status(400).json({ status: 'error', message: 'Invalid scheduleAt datetime' });
    }
    if (runAt.getTime() < Date.now() + 30 * 1000) {
      return res.status(400).json({ status: 'error', message: 'Schedule time must be at least 30 seconds in the future' });
    }

    const job = scheduler.scheduleBroadcast({ groupIds, message, runAtMs: runAt.getTime() });
    res.status(200).json({ status: 'success', message: 'Broadcast scheduled', data: job });
  } catch (error) {
    res.status(error.status || 500).json({ status: 'error', message: error.message || 'Failed to schedule broadcast' });
  }
});

router.post('/image', upload.single('image'), async (req, res) => {
  let uploadedFilePath = null;
  
  try {
    const { groupId, caption } = req.body;
    
    if (!groupId) {
      return res.status(400).json({
        status: 'error',
        message: 'Group ID is required'
      });
    }
    
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'Image file is required'
      });
    }
    
    uploadedFilePath = req.file.path;
    
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
    
    const imageUrl = await uploadImageToCloud(uploadedFilePath);
    
    const messageData = {
      to: groupId,
      imageUrl: imageUrl
    };
    
    if (caption) {
      messageData.caption = caption;
    }
    
    const result = await wasenderApi.sendMessage(messageData);
    
    await fs.remove(uploadedFilePath);
    
    res.status(200).json({
      status: 'success',
      message: 'Image sent successfully',
      data: result
    });
  } catch (error) {
    if (uploadedFilePath) {
      await fs.remove(uploadedFilePath).catch(console.error);
    }
    
    res.status(error.status || 500).json({
      status: 'error',
      message: error.message || 'Failed to send image'
    });
  }
});

router.post('/broadcast', async (req, res) => {
  try {
    const { groupIds, message } = req.body;
    
    if (!groupIds || !Array.isArray(groupIds) || groupIds.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Group IDs array is required'
      });
    }
    
    if (!message) {
      return res.status(400).json({
        status: 'error',
        message: 'Message is required'
      });
    }
    
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
    
    const results = [];
    const errors = [];
    
    for (const groupId of groupIds) {
      try {
        const messageData = {
          to: groupId,
          text: message
        };
        
        const result = await wasenderApi.sendMessage(messageData);
        results.push({
          groupId,
          status: 'success',
          data: result
        });
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        errors.push({
          groupId,
          status: 'error',
          message: error.message
        });
      }
    }
    
    res.status(200).json({
      status: 'success',
      message: 'Broadcast completed',
      data: {
        totalGroups: groupIds.length,
        successful: results.length,
        failed: errors.length,
        results,
        errors
      }
    });
  } catch (error) {
    res.status(error.status || 500).json({
      status: 'error',
      message: error.message || 'Failed to broadcast message'
    });
  }
});

module.exports = router;