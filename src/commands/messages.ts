import { Command } from 'commander';
import ora from 'ora';
import { getAuthenticatedClient } from '../lib/auth.ts';
import { success, error, formatScheduledMessages } from '../lib/formatter.ts';
import type { SlackScheduledMessage } from '../types/index.ts';

export function createMessagesCommand(): Command {
  const messages = new Command('messages')
    .description('Send and manage messages');

  // Send message
  messages
    .command('send')
    .description('Send a message to a channel or user')
    .requiredOption('--recipient-id <id>', 'Channel ID or User ID')
    .requiredOption('--message <text>', 'Message text content')
    .option('--thread-ts <timestamp>', 'Send as reply to thread')
    .option('--workspace <id|name>', 'Workspace to use')
    .action(async (options) => {
      const spinner = ora('Sending message...').start();

      try {
        const client = await getAuthenticatedClient(options.workspace);

        // Check if recipient is a user ID (starts with U) and needs DM opened
        let channelId = options.recipientId;
        if (options.recipientId.startsWith('U')) {
          spinner.text = 'Opening direct message...';
          const dmResponse = await client.openConversation(options.recipientId);
          channelId = dmResponse.channel.id;
        }

        spinner.text = 'Sending message...';
        const response = await client.postMessage(channelId, options.message, {
          thread_ts: options.threadTs,
        });

        spinner.succeed('Message sent successfully!');
        success(`Message timestamp: ${response.ts}`);
      } catch (err: any) {
        spinner.fail('Failed to send message');
        error(err.message);
        process.exit(1);
      }
    });

  // Schedule message
  messages
    .command('schedule')
    .description('Schedule a message for future delivery')
    .requiredOption('--recipient-id <id>', 'Channel ID or User ID')
    .requiredOption('--message <text>', 'Message text content')
    .requiredOption('--time <datetime>', 'When to send (ISO 8601 format, e.g., "2025-01-20T14:30:00" or Unix timestamp)')
    .option('--thread-ts <timestamp>', 'Send as reply to thread')
    .option('--workspace <id|name>', 'Workspace to use')
    .action(async (options) => {
      const spinner = ora('Scheduling message...').start();

      try {
        const client = await getAuthenticatedClient(options.workspace);

        // Parse the time
        let postAt: number;
        if (/^\d+$/.test(options.time)) {
          // Unix timestamp
          postAt = parseInt(options.time, 10);
        } else {
          // ISO 8601 or other date string
          const date = new Date(options.time);
          if (isNaN(date.getTime())) {
            throw new Error('Invalid date format. Use ISO 8601 (e.g., "2025-01-20T14:30:00") or Unix timestamp.');
          }
          postAt = Math.floor(date.getTime() / 1000);
        }

        // Validate the time is in the future
        const now = Math.floor(Date.now() / 1000);
        if (postAt <= now) {
          throw new Error('Scheduled time must be in the future.');
        }

        // Validate the time is within 120 days
        const maxTime = now + (120 * 24 * 60 * 60);
        if (postAt > maxTime) {
          throw new Error('Cannot schedule messages more than 120 days in the future.');
        }

        // Check if recipient is a user ID (starts with U) and needs DM opened
        let channelId = options.recipientId;
        if (options.recipientId.startsWith('U')) {
          spinner.text = 'Opening direct message...';
          const dmResponse = await client.openConversation(options.recipientId);
          channelId = dmResponse.channel.id;
        }

        spinner.text = 'Scheduling message...';
        const response = await client.scheduleMessage(channelId, options.message, postAt, {
          thread_ts: options.threadTs,
        });

        const scheduledDate = new Date(postAt * 1000);
        spinner.succeed('Message scheduled successfully!');
        success(`Scheduled message ID: ${response.scheduled_message_id}`);
        success(`Will be sent: ${scheduledDate.toLocaleString()}`);
      } catch (err: any) {
        spinner.fail('Failed to schedule message');
        error(err.message);
        process.exit(1);
      }
    });

  // Scheduled subcommand group
  const scheduled = new Command('scheduled')
    .description('Manage scheduled messages');

  // List scheduled messages
  scheduled
    .command('list')
    .description('List pending scheduled messages')
    .option('--channel <id>', 'Filter by channel ID')
    .option('--limit <number>', 'Maximum number of messages to return', '100')
    .option('--workspace <id|name>', 'Workspace to use')
    .action(async (options) => {
      const spinner = ora('Fetching scheduled messages...').start();

      try {
        const client = await getAuthenticatedClient(options.workspace);

        const response = await client.listScheduledMessages({
          channel: options.channel,
          limit: parseInt(options.limit, 10),
        });

        spinner.stop();

        const scheduledMessages: SlackScheduledMessage[] = response.scheduled_messages || [];

        // Build channel name map
        const channelMap = new Map<string, string>();
        if (scheduledMessages.length > 0) {
          // Get unique channel IDs
          const channelIds = [...new Set(scheduledMessages.map(m => m.channel_id))];

          // Try to fetch channel info for each
          for (const channelId of channelIds) {
            try {
              const channelResponse = await client.request('conversations.info', { channel: channelId });
              if (channelResponse.ok && channelResponse.channel) {
                channelMap.set(channelId, channelResponse.channel.name || channelId);
              }
            } catch {
              // Channel info unavailable, will use ID
            }
          }
        }

        console.log(formatScheduledMessages(scheduledMessages, channelMap));
      } catch (err: any) {
        spinner.fail('Failed to fetch scheduled messages');
        error(err.message);
        process.exit(1);
      }
    });

  // Delete scheduled message
  scheduled
    .command('delete')
    .description('Delete a scheduled message before it is sent')
    .requiredOption('--channel <id>', 'Channel ID where the message is scheduled')
    .requiredOption('--message-id <id>', 'Scheduled message ID to delete')
    .option('--workspace <id|name>', 'Workspace to use')
    .action(async (options) => {
      const spinner = ora('Deleting scheduled message...').start();

      try {
        const client = await getAuthenticatedClient(options.workspace);

        await client.deleteScheduledMessage(options.channel, options.messageId);

        spinner.succeed('Scheduled message deleted successfully!');
      } catch (err: any) {
        spinner.fail('Failed to delete scheduled message');
        error(err.message);
        process.exit(1);
      }
    });

  messages.addCommand(scheduled);

  return messages;
}

