const { EventBridgeClient, PutRuleCommand, PutTargetsCommand } = require('@aws-sdk/client-eventbridge');

const REGION = process.env.AWS_REGION;
let client = null;
const getClient = () => {
  if (!client) client = new EventBridgeClient({ region: REGION });
  return client;
};

const toCronFromIsoUtc = (isoUtc) => {
  const d = new Date(isoUtc);
  const minutes = d.getUTCMinutes();
  const hours = d.getUTCHours();
  const day = d.getUTCDate();
  const month = d.getUTCMonth() + 1;
  const year = d.getUTCFullYear();
  return `cron(${minutes} ${hours} ${day} ${month} ? ${year})`;
};

async function ensureUniqueRuleName(base, isoUtc) {
  return `${base}-${new Date(isoUtc).getTime()}`;
}

async function scheduleApiDestination({ baseName, isoUtc, apiDestinationArn, roleArn, payload }) {
  const name = await ensureUniqueRuleName(baseName, isoUtc);
  const scheduleExpression = toCronFromIsoUtc(isoUtc);

  await getClient().send(new PutRuleCommand({
    Name: name,
    ScheduleExpression: scheduleExpression,
    State: 'ENABLED',
    Description: `One-time schedule for ${isoUtc}`
  }));

  await getClient().send(new PutTargetsCommand({
    Rule: name,
    Targets: [
      {
        Id: '1',
        Arn: apiDestinationArn,
        RoleArn: roleArn,
        Input: JSON.stringify(payload)
      }
    ]
  }));

  return { ruleName: name, scheduleExpression };
}

module.exports = {
  scheduleApiDestination
}; 