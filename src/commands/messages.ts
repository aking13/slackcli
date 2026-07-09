import { Command } from 'commander';
import ora from 'ora';
import { getAuthenticatedClient } from '../lib/auth.ts';
import { requireExplicitWorkspace } from '../lib/workspaces.ts';
import { success, error } from '../lib/formatter.ts';

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
    .option('--file <path>', 'Attach a file to the message')
    .option('--workspace <id|name>', 'Workspace to use (required when more than one workspace is authenticated)')
    .action(async (options) => {
      await requireExplicitWorkspace(options.workspace);
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

        if (options.file) {
          spinner.text = 'Uploading file...';
          await client.uploadFileExternal(channelId, options.file, {
            initial_comment: options.message,
            thread_ts: options.threadTs,
          });

          spinner.succeed('Message sent successfully!');
          success('File uploaded successfully');
          return;
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

  // Add a reaction to a message
  messages
    .command('react')
    .description('Add an emoji reaction to a message')
    .requiredOption('--channel-id <id>', 'Channel ID where the message is')
    .requiredOption('--timestamp <ts>', 'Message timestamp')
    .requiredOption('--emoji <name>', 'Emoji name without colons (e.g., thumbsup, heart, fire)')
    .option('--workspace <id|name>', 'Workspace to use (required when more than one workspace is authenticated)')
    .action(async (options) => {
      await requireExplicitWorkspace(options.workspace);
      const spinner = ora('Adding reaction...').start();

      try {
        const client = await getAuthenticatedClient(options.workspace);

        await client.addReaction(options.channelId, options.timestamp, options.emoji);

        spinner.succeed('Reaction added successfully!');
        success(`Added :${options.emoji}: to message ${options.timestamp}`);
      } catch (err: any) {
        spinner.fail('Failed to add reaction');
        error(err.message);
        process.exit(1);
      }
    });

  // Remove a reaction from a message
  messages
    .command('unreact')
    .description('Remove an emoji reaction from a message')
    .requiredOption('--channel-id <id>', 'Channel ID where the message is')
    .requiredOption('--timestamp <ts>', 'Message timestamp')
    .requiredOption('--emoji <name>', 'Emoji name without colons (e.g., thumbsup, heart, fire)')
    .option('--workspace <id|name>', 'Workspace to use (required when more than one workspace is authenticated)')
    .action(async (options) => {
      await requireExplicitWorkspace(options.workspace);
      const spinner = ora('Removing reaction...').start();

      try {
        const client = await getAuthenticatedClient(options.workspace);

        await client.removeReaction(options.channelId, options.timestamp, options.emoji);

        spinner.succeed('Reaction removed successfully!');
        success(`Removed :${options.emoji}: from message ${options.timestamp}`);
      } catch (err: any) {
        spinner.fail('Failed to remove reaction');
        error(err.message);
        process.exit(1);
      }
    });

  return messages;
}

