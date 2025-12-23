import chalk from 'chalk';
import type { SlackChannel, SlackMessage, SlackUser, WorkspaceConfig } from '../types/index.ts';

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

