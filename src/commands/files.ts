import { Command } from 'commander';
import ora from 'ora';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { getAuthenticatedClient } from '../lib/auth.ts';
import { success, error, info, warning, formatFileList, formatFileSize, getFileIcon } from '../lib/formatter.ts';
import type { SlackFile, SlackUser } from '../types/index.ts';

export function createFilesCommand(): Command {
  const files = new Command('files')
    .description('Download and read files from Slack');

  // Read file content (text-based files)
  files
    .command('read')
    .description('Read file content as text (for VTT, text files, etc.)')
    .requiredOption('--url <url>', 'File URL (url_private or url_private_download)')
    .option('--workspace <id|name>', 'Workspace to use')
    .action(async (options) => {
      const spinner = ora('Fetching file content...').start();

      try {
        const client = await getAuthenticatedClient(options.workspace);
        const content = await client.fetchFileContent(options.url);

        spinner.succeed('File content retrieved!');
        console.log('\n' + content);
      } catch (err: any) {
        spinner.fail('Failed to fetch file');
        error(err.message);
        process.exit(1);
      }
    });

  // Download file (binary)
  files
    .command('download')
    .description('Download a file to disk')
    .requiredOption('--url <url>', 'File URL (url_private or url_private_download)')
    .requiredOption('--output <path>', 'Output file path')
    .option('--workspace <id|name>', 'Workspace to use')
    .action(async (options) => {
      const spinner = ora('Downloading file...').start();

      try {
        const client = await getAuthenticatedClient(options.workspace);
        const buffer = await client.fetchFileBinary(options.url);

        writeFileSync(options.output, Buffer.from(buffer));

        spinner.succeed('File downloaded successfully!');
        success(`Saved to: ${options.output}`);
        info(`Size: ${buffer.byteLength} bytes`);
      } catch (err: any) {
        spinner.fail('Failed to download file');
        error(err.message);
        process.exit(1);
      }
    });

  // List files in a conversation or workspace
  files
    .command('list')
    .description('List files in a conversation or workspace')
    .option('--channel <id>', 'Channel ID to filter files by')
    .option('--user <id>', 'User ID to filter files by')
    .option('--types <types>', 'File types (comma-separated: images, videos, pdfs, docs, spaces, snippets, gdocs, zips)')
    .option('--count <number>', 'Number of files to return (default: 100)', '100')
    .option('--page <number>', 'Page number for pagination', '1')
    .option('--workspace <id|name>', 'Workspace to use')
    .option('--json', 'Output in JSON format', false)
    .action(async (options) => {
      const spinner = ora('Fetching files...').start();

      try {
        const client = await getAuthenticatedClient(options.workspace);

        const response = await client.listFiles({
          channel: options.channel,
          user: options.user,
          types: options.types,
          count: parseInt(options.count),
          page: parseInt(options.page),
        });

        const fileList: SlackFile[] = response.files || [];

        // Fetch user info for files
        const userIds = new Set<string>();
        fileList.forEach((file: SlackFile) => {
          if (file.user) {
            userIds.add(file.user);
          }
        });

        const users = new Map<string, SlackUser>();
        if (userIds.size > 0) {
          spinner.text = 'Fetching user information...';
          const usersResponse = await client.getUsersInfo(Array.from(userIds));
          usersResponse.users?.forEach((user: SlackUser) => {
            users.set(user.id, user);
          });
        }

        spinner.succeed(`Found ${fileList.length} files`);

        if (options.json) {
          console.log(JSON.stringify({
            file_count: fileList.length,
            paging: response.paging,
            files: fileList.map((f: SlackFile) => ({
              id: f.id,
              name: f.name,
              title: f.title,
              filetype: f.filetype,
              size: f.size,
              created: f.created,
              user: f.user,
              user_name: f.user ? users.get(f.user)?.real_name : null,
              url_private: f.url_private,
              url_private_download: f.url_private_download,
            })),
          }, null, 2));
        } else {
          console.log('\n' + formatFileList(fileList, users));

          // Show pagination info if available
          if (response.paging) {
            const { page, pages, total } = response.paging;
            info(`Page ${page} of ${pages} (${total} total files)`);
          }
        }
      } catch (err: any) {
        spinner.fail('Failed to fetch files');
        error(err.message, 'Run "slackcli auth list" to check your authentication.');
        process.exit(1);
      }
    });

  // Download all files from a conversation
  files
    .command('download-all')
    .description('Batch download files from a conversation')
    .requiredOption('--channel <id>', 'Channel ID to download files from')
    .option('--output <dir>', 'Output directory (default: ./downloads)', './downloads')
    .option('--types <types>', 'File types to download (comma-separated: images, videos, pdfs, docs, etc.)')
    .option('--count <number>', 'Maximum number of files to download', '100')
    .option('--workspace <id|name>', 'Workspace to use')
    .action(async (options) => {
      const spinner = ora('Fetching file list...').start();

      try {
        const client = await getAuthenticatedClient(options.workspace);

        // Create output directory if it doesn't exist
        const outputDir = options.output;
        if (!existsSync(outputDir)) {
          mkdirSync(outputDir, { recursive: true });
        }

        // Fetch file list for the channel
        const response = await client.listFiles({
          channel: options.channel,
          types: options.types,
          count: parseInt(options.count),
        });

        const fileList: SlackFile[] = response.files || [];

        if (fileList.length === 0) {
          spinner.warn('No files found in this channel');
          return;
        }

        spinner.succeed(`Found ${fileList.length} files to download`);

        let downloadedCount = 0;
        let failedCount = 0;
        let skippedCount = 0;

        for (const file of fileList) {
          const downloadUrl = file.url_private_download || file.url_private;
          if (!downloadUrl) {
            skippedCount++;
            warning(`Skipping ${file.name || file.id}: No download URL available`);
            continue;
          }

          // Skip deleted/tombstone files
          if (file.mode === 'tombstone') {
            skippedCount++;
            continue;
          }

          const fileName = file.name || `${file.id}.${file.filetype || 'bin'}`;
          const outputPath = join(outputDir, fileName);

          // Check for duplicate filenames and add suffix if needed
          let finalPath = outputPath;
          let counter = 1;
          while (existsSync(finalPath)) {
            const ext = fileName.includes('.') ? '.' + fileName.split('.').pop() : '';
            const nameWithoutExt = fileName.includes('.') ? fileName.slice(0, fileName.lastIndexOf('.')) : fileName;
            finalPath = join(outputDir, `${nameWithoutExt}_${counter}${ext}`);
            counter++;
          }

          const downloadSpinner = ora(`Downloading ${fileName}...`).start();

          try {
            const buffer = await client.fetchFileBinary(downloadUrl);
            writeFileSync(finalPath, Buffer.from(buffer));
            downloadSpinner.succeed(`Downloaded: ${basename(finalPath)} (${formatFileSize(buffer.byteLength)})`);
            downloadedCount++;
          } catch (err: any) {
            downloadSpinner.fail(`Failed to download ${fileName}: ${err.message}`);
            failedCount++;
          }
        }

        console.log('');
        success(`Downloaded ${downloadedCount} files to ${outputDir}`);
        if (failedCount > 0) {
          warning(`${failedCount} files failed to download`);
        }
        if (skippedCount > 0) {
          info(`${skippedCount} files skipped (no URL or deleted)`);
        }
      } catch (err: any) {
        spinner.fail('Failed to download files');
        error(err.message);
        process.exit(1);
      }
    });

  return files;
}
