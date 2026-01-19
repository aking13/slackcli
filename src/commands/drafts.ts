import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getAuthenticatedClient } from '../lib/auth.ts';
import { success, error } from '../lib/formatter.ts';

export function createDraftsCommand(): Command {
  const drafts = new Command('drafts')
    .description('Manage message drafts (requires browser auth)');

  // List drafts
  drafts
    .command('list')
    .description('List all active drafts')
    .option('--all', 'Include sent and deleted drafts')
    .option('--workspace <id|name>', 'Workspace to use')
    .action(async (options) => {
      const spinner = ora('Fetching drafts...').start();

      try {
        const client = await getAuthenticatedClient(options.workspace);
        const response = await client.listDrafts({ all: options.all });

        spinner.stop();

        if (!response.drafts || response.drafts.length === 0) {
          success('No drafts found');
          return;
        }

        // If --all flag, show all drafts with status
        // Otherwise, show only active drafts (API already filtered)
        const draftsToShow = options.all
          ? response.drafts
          : response.drafts;

        if (draftsToShow.length === 0) {
          success('No active drafts found');
          return;
        }

        console.log(chalk.bold(`\n📝 Drafts (${draftsToShow.length})\n`));

        draftsToShow.forEach((draft: any, index: number) => {
          // Extract text from blocks if present
          let text = '';
          if (draft.blocks && draft.blocks.length > 0) {
            const block = draft.blocks[0];
            if (block.elements && block.elements.length > 0) {
              const section = block.elements[0];
              if (section.elements && section.elements.length > 0) {
                text = section.elements.map((el: any) => el.text || '').join('');
              }
            }
          }
          const preview = text.substring(0, 60) + (text.length > 60 ? '...' : '');

          // Get destination channel
          const channel = draft.destinations?.[0]?.channel_id || 'Unknown';

          console.log(chalk.cyan(`${index + 1}. ${draft.id}`));
          console.log(`   Channel: ${channel}`);
          console.log(`   Preview: ${preview}`);

          if (options.all) {
            const status = draft.is_deleted ? chalk.red('Deleted') :
                           draft.is_sent ? chalk.green('Sent') :
                           chalk.yellow('Active');
            console.log(`   Status: ${status}`);
          }
          console.log('');
        });

        success(`Found ${draftsToShow.length} draft(s)`);
      } catch (err: any) {
        spinner.stop();
        error(`Error: ${err.message}`);
      }
    });

  // Create a draft
  drafts
    .command('create')
    .description('Create a new draft')
    .requiredOption('--channel-id <id>', 'Channel ID to create draft for')
    .requiredOption('--text <text>', 'Draft message text')
    .option('--workspace <id|name>', 'Workspace to use')
    .action(async (options) => {
      const spinner = ora('Creating draft...').start();

      try {
        const client = await getAuthenticatedClient(options.workspace);
        const response = await client.createDraft({
          channelId: options.channelId,
          text: options.text,
        });

        spinner.stop();

        if (response.draft) {
          success(`Draft created successfully`);
          console.log(chalk.cyan(`Draft ID: ${response.draft.id}`));
        } else {
          success('Draft created');
        }
      } catch (err: any) {
        spinner.stop();
        error(`Error: ${err.message}`);
      }
    });

  // Delete a draft
  drafts
    .command('delete')
    .description('Delete a draft')
    .requiredOption('--draft-id <id>', 'Draft ID to delete')
    .option('--workspace <id|name>', 'Workspace to use')
    .action(async (options) => {
      const spinner = ora('Deleting draft...').start();

      try {
        const client = await getAuthenticatedClient(options.workspace);
        await client.deleteDraft(options.draftId);

        spinner.stop();
        success('Draft deleted successfully');
      } catch (err: any) {
        spinner.stop();
        error(`Failed to delete draft`);
        error(`Error: ${err.message}`);
      }
    });

  return drafts;
}
