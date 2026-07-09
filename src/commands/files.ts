import { Command } from 'commander';
import ora from 'ora';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { getAuthenticatedClient } from '../lib/auth.ts';
import { success, error, info, warning, formatFileList, formatFileSize, getFileIcon } from '../lib/formatter.ts';
import { parseVttToText } from '../lib/vtt-parser.ts';
import type { SlackFile, SlackUser } from '../types/index.ts';

// Resolve a file id from an exact channel+ts. Never falls back to a different
// message — a wrong-media result is worse than a loud failure. For a thread
// reply, pass threadTs (the parent) so the whole thread is searched.
async function resolveFileIdFromMessage(
  client: any,
  channel: string,
  ts: string,
  threadTs?: string
): Promise<string> {
  let messages: any[] = [];
  if (threadTs) {
    let cursor: string | undefined;
    for (let page = 0; page < 25; page++) {
      const res = await client.getConversationReplies(channel, threadTs, cursor ? { cursor, limit: 200 } : { limit: 200 });
      messages = messages.concat(res.messages || []);
      if (messages.some((m: any) => m.ts === ts)) break;
      cursor = res.has_more ? res.response_metadata?.next_cursor : undefined;
      if (!cursor) break;
    }
  } else {
    const res = await client.getConversationHistory(channel, { latest: ts, oldest: ts, inclusive: true, limit: 1 });
    messages = res.messages || [];
  }
  const msg = messages.find((m: any) => m.ts === ts);
  if (!msg) {
    throw new Error(`message ${ts} not found in ${channel} (searched ${messages.length}). For a thread reply pass --thread-ts <parent>, or use --file.`);
  }
  const files = msg.files || [];
  const file = files.find((f: any) => (f.mimetype || '').startsWith('video/')) || files[0];
  if (!file) throw new Error(`message ${ts} in ${channel} has no attached file`);
  return file.id;
}

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

  // Generate (if needed) and print a video's transcript
  files
    .command('transcript')
    .description('Get a video file transcript (generates it if Slack has not yet)')
    .option('--file <id>', 'File ID (e.g. F0BG53QCYUU)')
    .option('--channel <id>', 'Channel ID (with --ts) to resolve the file from a message')
    .option('--ts <ts>', 'Message ts to resolve the file from')
    .option('--thread-ts <ts>', 'Parent thread ts (when the message is a thread reply)')
    .option('--no-generate', 'Do not trigger generation; only print if already transcribed')
    .option('--timeout <seconds>', 'How long to wait for generation', '120')
    .option('--workspace <id|name>', 'Workspace to use')
    .option('--json', 'Output {file_id, status, transcript} as JSON', false)
    .action(async (options) => {
      const spinner = ora('Reading file info...').start();
      try {
        const client = await getAuthenticatedClient(options.workspace);

        let fileId: string = options.file;
        if (!fileId) {
          if (!options.channel || !options.ts) {
            throw new Error('provide --file <id>, or --channel <id> --ts <ts> [--thread-ts <parent>]');
          }
          spinner.text = 'Resolving file from message...';
          fileId = await resolveFileIdFromMessage(client, options.channel, options.ts, options.threadTs);
        }

        let file = (await client.getFileInfo(fileId)).file;
        let status: string = file?.transcription?.status || 'none';

        if (!file?.is_transcription_region_supported) {
          spinner.fail('This file does not support transcription');
          process.exit(1);
        }

        // Trigger generation if not complete (unless --no-generate).
        if (status !== 'complete' && options.generate !== false) {
          spinner.text = `Generating transcript (status: ${status})...`;
          await client.retranscribeFile(fileId);
          const deadline = Date.now() + parseInt(options.timeout) * 1000;
          while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 4000));
            file = (await client.getFileInfo(fileId)).file;
            status = file?.transcription?.status || 'none';
            if (status === 'complete' || status === 'failed') break;
            spinner.text = `Waiting for transcript (status: ${status})...`;
          }
        }

        if (status !== 'complete' || !file?.vtt) {
          spinner.fail(`Transcript not available (status: ${status})`);
          if (status !== 'complete') info('Slack is still processing — retry shortly, or raise --timeout.');
          process.exit(1);
        }

        spinner.text = 'Downloading transcript...';
        const vtt = await client.fetchFileContent(file.vtt);
        const text = parseVttToText(vtt);

        spinner.succeed('Transcript ready!');
        if (options.json) {
          console.log(JSON.stringify({ file_id: fileId, status, transcript: text }, null, 2));
        } else {
          console.log('\n' + text);
        }
      } catch (err: any) {
        spinner.fail('Failed to get transcript');
        error(err.message, 'Run "slackcli auth list" to check your authentication.');
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
