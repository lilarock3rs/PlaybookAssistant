import { App } from '@slack/bolt';
import { config } from '../config';

export const slackApp = new App({
  token: config.slack.botToken,
  signingSecret: config.slack.signingSecret,
  processBeforeResponse: true,
});

export const sendSlackMessage = async (
  channel: string,
  text: string,
  blocks?: any[]
): Promise<void> => {
  try {
    await slackApp.client.chat.postMessage({
      channel,
      text,
      blocks,
    });
  } catch (error) {
    console.error('Error sending Slack message:', error);
    throw error;
  }
};

export const sendEphemeralMessage = async (
  channel: string,
  user: string,
  text: string,
  blocks?: any[]
): Promise<void> => {
  try {
    await slackApp.client.chat.postEphemeral({
      channel,
      user,
      text,
      blocks,
    });
  } catch (error) {
    console.error('Error sending ephemeral message:', error);
    throw error;
  }
};