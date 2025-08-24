const wasenderApi = require('./wasenderApi');

// In-memory scheduled jobs (lost on restart)
const scheduledJobs = new Map();
let nextId = 1;

const scheduleBroadcast = (params) => {
  const { groupIds, message, runAtMs } = params;
  const now = Date.now();
  const delay = Math.max(0, runAtMs - now);
  const id = String(nextId++);

  const timeout = setTimeout(async () => {
    try {
      // Check for connected session before sending
      const sessionsResponse = await wasenderApi.getAllSessions();
      const sessions = (sessionsResponse && sessionsResponse.data) || [];
      const connectedSession = sessions.find(session => session.status === 'connected');
      if (!connectedSession) {
        // Best-effort: skip if no active session at execution time
        scheduledJobs.delete(id);
        return;
      }

      for (const groupId of groupIds) {
        try {
          await wasenderApi.sendMessage({ to: groupId, text: message });
          await new Promise(resolve => setTimeout(resolve, 800));
        } catch (err) {
          // continue with other groups
        }
      }
    } catch (err) {
      // swallow; job done regardless
    } finally {
      scheduledJobs.delete(id);
    }
  }, delay);

  scheduledJobs.set(id, { id, runAtMs, groupIds, message, timeout });
  return { id, runAtMs };
};

const cancelJob = (id) => {
  const job = scheduledJobs.get(id);
  if (!job) return false;
  clearTimeout(job.timeout);
  scheduledJobs.delete(id);
  return true;
};

const listJobs = () => {
  return Array.from(scheduledJobs.values()).map(({ timeout, ...rest }) => rest);
};

module.exports = {
  scheduleBroadcast,
  cancelJob,
  listJobs
}; 