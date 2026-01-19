import chalk from 'chalk';
import type { SlackChannel, SlackFile, SlackMessage, SlackScheduledMessage, SlackUnreadChannel, SlackUser, WorkspaceConfig } from '../types/index.ts';

// Get icon for file type
export function getFileIcon(filetype?: string): string {
  const icons: Record<string, string> = {
    'png': '🖼️', 'jpg': '🖼️', 'jpeg': '🖼️', 'gif': '🖼️', 'webp': '🖼️',
    'pdf': '📄', 'docx': '📝', 'doc': '📝',
    'xlsx': '📊', 'xls': '📊', 'csv': '📊',
    'pptx': '📽️', 'ppt': '📽️',
    'mp4': '🎬', 'mov': '🎬', 'webm': '🎬',
    'mp3': '🎵', 'wav': '🎵',
    'zip': '📦', 'json': '📋', 'txt': '📄',
  };
  return icons[filetype || ''] || '📎';
}

// Format timestamp to human-readable date
export function formatTimestamp(ts: string): string {
  const timestamp = parseFloat(ts) * 1000;
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

// Format workspace info
export function formatWorkspace(config: WorkspaceConfig, isDefault: boolean = false): string {
  const defaultBadge = isDefault ? chalk.green('(default)') : '';
  const authType = config.auth_type === 'browser' ? '🌐 Browser' : '🔑 Standard';
  
  return `${chalk.bold(config.workspace_name)} ${defaultBadge}
  ID: ${config.workspace_id}
  Auth: ${authType}`;
}

// Format channel list
export function formatChannelList(channels: SlackChannel[], users: Map<string, SlackUser>): string {
  const publicChannels: SlackChannel[] = [];
  const privateChannels: SlackChannel[] = [];
  const directMessages: SlackChannel[] = [];
  const groupMessages: SlackChannel[] = [];

  channels.forEach(channel => {
    if (channel.is_im) {
      directMessages.push(channel);
    } else if (channel.is_mpim) {
      groupMessages.push(channel);
    } else if (channel.is_private) {
      privateChannels.push(channel);
    } else {
      publicChannels.push(channel);
    }
  });

  let output = chalk.bold(`📋 Conversations (${channels.length})\n`);

  if (publicChannels.length > 0) {
    output += chalk.cyan('\nPublic Channels:\n');
    publicChannels.forEach((ch, idx) => {
      const archived = ch.is_archived ? chalk.gray(' [archived]') : '';
      output += `  ${idx + 1}. #${ch.name} ${chalk.dim(`(${ch.id})`)}${archived}\n`;
      if (ch.topic?.value) {
        output += `     ${chalk.dim(ch.topic.value)}\n`;
      }
    });
  }

  if (privateChannels.length > 0) {
    output += chalk.yellow('\nPrivate Channels:\n');
    privateChannels.forEach((ch, idx) => {
      const archived = ch.is_archived ? chalk.gray(' [archived]') : '';
      output += `  ${idx + 1}. 🔒 ${ch.name} ${chalk.dim(`(${ch.id})`)}${archived}\n`;
    });
  }

  if (groupMessages.length > 0) {
    output += chalk.magenta('\nGroup Messages:\n');
    groupMessages.forEach((ch, idx) => {
      output += `  ${idx + 1}. 👥 ${ch.name || 'Group'} ${chalk.dim(`(${ch.id})`)}\n`;
    });
  }

  if (directMessages.length > 0) {
    output += chalk.blue('\nDirect Messages:\n');
    directMessages.forEach((ch, idx) => {
      const user = ch.user ? users.get(ch.user) : null;
      const userName = user?.real_name || user?.name || 'Unknown User';
      output += `  ${idx + 1}. 👤 @${userName} ${chalk.dim(`(${ch.id})`)}\n`;
    });
  }

  return output;
}

// Format message with reactions
export function formatMessage(
  msg: SlackMessage,
  users: Map<string, SlackUser>,
  indent: number = 0
): string {
  const indentStr = ' '.repeat(indent);
  const user = msg.user ? users.get(msg.user) : null;
  const userName = user?.real_name || user?.name || msg.bot_id || 'Unknown';
  const timestamp = formatTimestamp(msg.ts);
  const isThread = msg.thread_ts && msg.thread_ts !== msg.ts;
  const threadIndicator = isThread ? chalk.dim(' (in thread)') : '';
  
  let output = `${indentStr}${chalk.dim(`[${timestamp}]`)} ${chalk.bold(`@${userName}`)}${threadIndicator}\n`;
  
  // Message text
  const textLines = msg.text.split('\n');
  textLines.forEach(line => {
    output += `${indentStr}  ${line}\n`;
  });
  
  // Show timestamps for threading
  if (msg.ts) {
    output += `${indentStr}  ${chalk.dim(`ts: ${msg.ts}`)}`;
    if (msg.thread_ts && msg.thread_ts !== msg.ts) {
      output += chalk.dim(` | thread_ts: ${msg.thread_ts}`);
    }
    output += '\n';
  }

  // Video transcript
  if (msg.transcript) {
    output += `${indentStr}  ${chalk.magenta('📹 Video Transcript:')}\n`;
    const transcriptLines = msg.transcript.split('\n');
    transcriptLines.forEach(line => {
      output += `${indentStr}    ${chalk.italic(line)}\n`;
    });
  }

  // Reactions
  if (msg.reactions && msg.reactions.length > 0) {
    const reactionsStr = msg.reactions
      .map(r => `${r.name} ${r.count}`)
      .join('  ');
    output += `${indentStr}  ${chalk.dim(reactionsStr)}\n`;
  }

  // File attachments
  if (msg.files && msg.files.length > 0) {
    msg.files.forEach(file => {
      if (file.mode === 'tombstone') return; // Skip deleted files

      const icon = getFileIcon(file.filetype);
      const name = file.name || file.title || 'Untitled';
      output += `${indentStr}  ${icon} ${chalk.blue(name)}\n`;
      output += `${indentStr}     ${chalk.dim(`Type: ${file.pretty_type || file.filetype || 'unknown'}`)}\n`;

      const downloadUrl = file.url_private_download || file.url_private;
      if (downloadUrl) {
        output += `${indentStr}     ${chalk.dim(`URL: ${downloadUrl}`)}\n`;
      }

      // Show transcript status for videos
      if (file.transcription) {
        const status = file.transcription.status;
        const statusIcon = status === 'complete' ? '✅' : status === 'processing' ? '⏳' : '❌';
        output += `${indentStr}     ${chalk.dim(`Transcript: ${statusIcon} ${status}`)}\n`;
      }
    });
  }

  // Thread indicator
  if (msg.reply_count && !isThread) {
    output += `${indentStr}  ${chalk.cyan(`💬 ${msg.reply_count} replies`)}\n`;
  }
  
  return output;
}

// Format a thread reply with tree structure
function formatThreadReply(
  msg: SlackMessage,
  users: Map<string, SlackUser>,
  isLast: boolean
): string {
  const prefix = isLast ? '└─' : '├─';
  const continuePrefix = isLast ? '   ' : '│  ';
  const user = msg.user ? users.get(msg.user) : null;
  const userName = user?.real_name || user?.name || msg.bot_id || 'Unknown';
  const timestamp = formatTimestamp(msg.ts);

  let output = `  ${chalk.dim(prefix)} ${chalk.dim(`[${timestamp}]`)} ${chalk.bold(`@${userName}`)}\n`;

  // Message text
  const textLines = msg.text.split('\n');
  textLines.forEach(line => {
    output += `  ${chalk.dim(continuePrefix)}   ${line}\n`;
  });

  // Show timestamps
  output += `  ${chalk.dim(continuePrefix)}   ${chalk.dim(`ts: ${msg.ts} | thread_ts: ${msg.thread_ts}`)}\n`;

  // Video transcript
  if (msg.transcript) {
    output += `  ${chalk.dim(continuePrefix)}   ${chalk.magenta('📹 Video Transcript:')}\n`;
    const transcriptLines = msg.transcript.split('\n');
    transcriptLines.forEach(line => {
      output += `  ${chalk.dim(continuePrefix)}     ${chalk.italic(line)}\n`;
    });
  }

  // Reactions
  if (msg.reactions && msg.reactions.length > 0) {
    const reactionsStr = msg.reactions
      .map(r => `${r.name} ${r.count}`)
      .join('  ');
    output += `  ${chalk.dim(continuePrefix)}   ${chalk.dim(reactionsStr)}\n`;
  }

  return output;
}

// Format conversation history
export function formatConversationHistory(
  channelName: string,
  messages: SlackMessage[],
  users: Map<string, SlackUser>,
  includeThreads: boolean = false
): string {
  let output = chalk.bold(`💬 #${channelName} (${messages.length} messages)\n\n`);

  messages.forEach((msg, idx) => {
    output += formatMessage(msg, users);

    // Render thread replies if present
    if (includeThreads && msg.thread_replies && msg.thread_replies.length > 0) {
      output += `  ${chalk.cyan(`💬 ${msg.thread_replies.length} replies:`)}\n\n`;
      msg.thread_replies.forEach((reply, replyIdx) => {
        const isLast = replyIdx === msg.thread_replies!.length - 1;
        output += formatThreadReply(reply, users, isLast);
        if (!isLast) {
          output += `  ${chalk.dim('│')}\n`;
        }
      });
    }

    if (idx < messages.length - 1) {
      output += '\n';
    }
  });

  return output;
}

// Format file size in human readable format
export function formatFileSize(bytes?: number): string {
  if (!bytes) return 'unknown size';
  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let size = bytes;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

// Format file list
export function formatFileList(
  files: SlackFile[],
  users: Map<string, SlackUser>
): string {
  let output = chalk.bold(`📁 Files (${files.length})\n\n`);

  if (files.length === 0) {
    output += chalk.dim('  No files found.\n');
    return output;
  }

  files.forEach((file, idx) => {
    const icon = getFileIcon(file.filetype);
    const name = file.name || file.title || 'Untitled';
    const size = formatFileSize(file.size);
    const user = file.user ? users.get(file.user) : null;
    const userName = user?.real_name || user?.name || file.user || 'Unknown';

    // File creation date
    const created = file.created
      ? new Date(file.created * 1000).toLocaleString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      : 'Unknown date';

    output += `${chalk.dim(`${idx + 1}.`)} ${icon} ${chalk.bold(name)}\n`;
    output += `   ${chalk.dim(`ID: ${file.id}`)}\n`;
    output += `   ${chalk.dim(`Type: ${file.pretty_type || file.filetype || 'unknown'} | Size: ${size}`)}\n`;
    output += `   ${chalk.dim(`By: @${userName} | ${created}`)}\n`;

    const downloadUrl = file.url_private_download || file.url_private;
    if (downloadUrl) {
      output += `   ${chalk.dim(`URL: ${downloadUrl}`)}\n`;
    }

    output += '\n';
  });

  return output;
}

// Format unread channels summary
export function formatUnreadSummary(
  channels: SlackUnreadChannel[],
  users: Map<string, SlackUser>
): string {
  const totalUnread = channels.reduce((sum, ch) => sum + ch.unread_count, 0);
  const totalMentions = channels.reduce((sum, ch) => sum + ch.mention_count, 0);

  let output = chalk.bold(`📬 Unread Messages\n`);
  output += chalk.dim(`   ${totalUnread} unread across ${channels.length} conversations`);
  if (totalMentions > 0) {
    output += chalk.yellow(` (${totalMentions} mentions)`);
  }
  output += '\n\n';

  if (channels.length === 0) {
    output += chalk.green('  All caught up! No unread messages.\n');
    return output;
  }

  // Group by type
  const dms = channels.filter(ch => ch.is_im);
  const groups = channels.filter(ch => ch.is_mpim);
  const privateChannels = channels.filter(ch => ch.is_private && !ch.is_mpim);
  const publicChannels = channels.filter(ch => !ch.is_im && !ch.is_mpim && !ch.is_private);

  const formatChannel = (ch: SlackUnreadChannel, prefix: string = '') => {
    const mentions = ch.mention_count > 0 ? chalk.yellow(` @${ch.mention_count}`) : '';
    const muted = ch.is_muted ? chalk.dim(' (muted)') : '';
    let name = ch.name;

    // For DMs, try to get user's real name
    if (ch.is_im && ch.name) {
      // DM names are often just user IDs, try to resolve
      const user = users.get(ch.id);
      if (user?.real_name) {
        name = user.real_name;
      }
    }

    return `  ${prefix}${chalk.bold(name)} ${chalk.cyan(`(${ch.unread_count})`)}${mentions}${muted}\n` +
           `     ${chalk.dim(`ID: ${ch.id}`)}\n`;
  };

  if (publicChannels.length > 0) {
    output += chalk.cyan('Public Channels:\n');
    publicChannels.forEach(ch => {
      output += formatChannel(ch, '#');
    });
    output += '\n';
  }

  if (privateChannels.length > 0) {
    output += chalk.yellow('Private Channels:\n');
    privateChannels.forEach(ch => {
      output += formatChannel(ch, '🔒 ');
    });
    output += '\n';
  }

  if (groups.length > 0) {
    output += chalk.magenta('Group Messages:\n');
    groups.forEach(ch => {
      output += formatChannel(ch, '👥 ');
    });
    output += '\n';
  }

  if (dms.length > 0) {
    output += chalk.blue('Direct Messages:\n');
    dms.forEach(ch => {
      output += formatChannel(ch, '👤 ');
    });
  }

  return output;
}

// Format scheduled messages list
export function formatScheduledMessages(
  messages: SlackScheduledMessage[],
  channels: Map<string, string>
): string {
  let output = chalk.bold(`📅 Scheduled Messages (${messages.length})\n\n`);

  if (messages.length === 0) {
    output += chalk.dim('  No scheduled messages found.\n');
    return output;
  }

  messages.forEach((msg, idx) => {
    const postAt = new Date(msg.post_at * 1000);
    const createdAt = new Date(msg.date_created * 1000);
    const channelName = channels.get(msg.channel_id) || msg.channel_id;

    const dateOptions: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    };

    output += `${chalk.dim(`${idx + 1}.`)} ${chalk.bold('Scheduled for:')} ${chalk.cyan(postAt.toLocaleString('en-US', dateOptions))}\n`;
    output += `   ${chalk.dim(`ID: ${msg.id}`)}\n`;
    output += `   ${chalk.dim(`Channel: #${channelName} (${msg.channel_id})`)}\n`;
    output += `   ${chalk.dim(`Created: ${createdAt.toLocaleString('en-US', dateOptions)}`)}\n`;
    output += `   ${chalk.white(msg.text)}\n`;
    output += '\n';
  });

  return output;
}

// Success message
export function success(message: string): void {
  console.log(chalk.green('✅'), message);
}

// Error message
export function error(message: string, hint?: string): void {
  console.error(chalk.red('❌ Error:'), message);
  if (hint) {
    console.error(chalk.dim(`   ${hint}`));
  }
}

// Info message
export function info(message: string): void {
  console.log(chalk.blue('ℹ️'), message);
}

// Warning message
export function warning(message: string): void {
  console.log(chalk.yellow('⚠️'), message);
}

