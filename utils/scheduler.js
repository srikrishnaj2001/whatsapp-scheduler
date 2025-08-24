const wasenderApi = require('./wasenderApi');

// In-memory scheduled jobs (lost on restart)
const scheduledJobs = new Map();
let nextId = 1;

const scheduleBroadcast = (params) => {
  const { groupIds, message, runAtMs } = params;
  const now = Date.now();
  const delay = Math.max(0, runAtMs - now);
  const id = String(nextId++);

  console.log(`[scheduler] Scheduled job ${id} at ${new Date(runAtMs).toISOString()} for ${groupIds.length} group(s)`);

  const timeout = setTimeout(async () => {
    console.log(`[scheduler] Executing job ${id} at ${new Date().toISOString()}`);
    try {
      // Check for connected session before sending
      const sessionsResponse = await wasenderApi.getAllSessions();
      const sessions = (sessionsResponse && sessionsResponse.data) || [];
      const connectedSession = sessions.find(session => session.status === 'connected');
      if (!connectedSession) {
        console.warn('[scheduler] No active WhatsApp session at execution time; skipping job', id);
        scheduledJobs.delete(id);
        return;
      }

      for (const groupId of groupIds) {
        try {
          await wasenderApi.sendMessage({ to: groupId, text: message });
          console.log(`[scheduler] Sent to ${groupId}`);
          await new Promise(resolve => setTimeout(resolve, 800));
        } catch (err) {
          console.warn(`[scheduler] Failed to send to ${groupId}: ${err?.message || err}`);
        }
      }
    } catch (err) {
      console.error('[scheduler] Unexpected error executing job', id, err);
    } finally {
      scheduledJobs.delete(id);
      console.log(`[scheduler] Job ${id} completed`);
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