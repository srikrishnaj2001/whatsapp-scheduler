const { SchedulerClient, CreateScheduleCommand, DeleteScheduleCommand } = require('@aws-sdk/client-scheduler');

const REGION = process.env.AWS_REGION;
const ACCOUNT_ID = process.env.AWS_ACCOUNT_ID;
const ROLE_ARN = process.env.AWS_SCHEDULER_ROLE_ARN; // IAM role that allows Invoke on the API Destination
const API_DESTINATION_ARN = process.env.AWS_API_DESTINATION_ARN; // arn:aws:events:region:account:api-destination/Name/Id

let client = null;
const getClient = () => {
  if (!client) client = new SchedulerClient({ region: REGION });
  return client;
};

const toAtExpression = (isoUtcString) => {
  // isoUtcString example: 2025-08-24T12:30:00Z
  // Scheduler requires at(yyyy-mm-ddThh:mm:ss)
  const noMs = isoUtcString.replace(/\.\d{3}Z$/, 'Z');
  const trimmed = noMs.endsWith('Z') ? noMs.slice(0, -1) : noMs;
  return `at(${trimmed})`;
};

async function createOneTimeSchedule({ name, runAtIsoUtc, payloadJson, flexibleWindow = false, description = '' }) {
  if (!ROLE_ARN || !API_DESTINATION_ARN) {
    throw new Error('Missing AWS_SCHEDULER_ROLE_ARN or AWS_API_DESTINATION_ARN');
  }

  const input = {
    Name: name,
    GroupName: process.env.AWS_SCHEDULER_GROUP || 'default',
    Description: description,
    ScheduleExpression: toAtExpression(runAtIsoUtc),
    FlexibleTimeWindow: { Mode: flexibleWindow ? 'FLEXIBLE' : 'OFF' },
    Target: {
      Arn: API_DESTINATION_ARN,
      RoleArn: ROLE_ARN,
      Input: payloadJson,
      RetryPolicy: { MaximumEventAgeInSeconds: 3600, MaximumRetryAttempts: 3 }
    }
  };

  const cmd = new CreateScheduleCommand(input);
  await getClient().send(cmd);
  return { name, runAtIsoUtc };
}

async function deleteSchedule(name) {
  const cmd = new DeleteScheduleCommand({ Name: name, GroupName: process.env.AWS_SCHEDULER_GROUP || 'default' });
  try {
    await getClient().send(cmd);
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  createOneTimeSchedule,
  deleteSchedule
}; 