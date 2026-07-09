import { WebClient } from '@slack/web-api';
import { basename } from 'node:path';
import { stat } from 'node:fs/promises';
import type { WorkspaceConfig, SlackAuthTestResponse } from '../types/index.ts';

interface ExternalUploadUrlResponse {
  upload_url?: string;
  file_id?: string;
}

export class SlackClient {
  private config: WorkspaceConfig;
  private webClient?: WebClient;

  constructor(config: WorkspaceConfig) {
    this.config = config;
    
    // Only use WebClient for standard auth
    if (config.auth_type === 'standard') {
      this.webClient = new WebClient(config.token);
    }
  }

  // Make API request (handles both auth types)
  async request(method: string, params: Record<string, any> = {}): Promise<any> {
    if (this.config.auth_type === 'standard') {
      return this.standardRequest(method, params);
    } else {
      return this.browserRequest(method, params);
    }
  }

  // Standard token request (using @slack/web-api)
  private async standardRequest(method: string, params: Record<string, any>): Promise<any> {
    if (!this.webClient) {
      throw new Error('WebClient not initialized');
    }

    try {
      const response = await this.webClient.apiCall(method, params);
      return response;
    } catch (error: any) {
      throw new Error(`Slack API error: ${error.message}`);
    }
  }

  // Browser token request (custom implementation)
  private async browserRequest(method: string, params: Record<string, any>): Promise<any> {
    if (this.config.auth_type !== 'browser') {
      throw new Error('Invalid auth type');
    }

    const url = `${this.config.workspace_url}/api/${method}`;
    
    const formBody = new URLSearchParams({
      token: this.config.xoxc_token,
      ...params,
    });

    try {
      // URL-encode the xoxd token for the cookie
      const encodedXoxdToken = encodeURIComponent(this.config.xoxd_token);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Cookie': `d=${encodedXoxdToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': 'https://app.slack.com',
          'User-Agent': 'Mozilla/5.0 (compatible; SlackCLI/0.1.0)',
        },
        body: formBody,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: any = await response.json();

      if (!data.ok) {
        throw new Error(data.error || 'Unknown API error');
      }

      return data;
    } catch (error: any) {
      throw new Error(`Slack API error: ${error.message}`);
    }
  }

  // Test authentication
  async testAuth(): Promise<SlackAuthTestResponse> {
    return this.request('auth.test', {});
  }

  // Workspace base URL (for constructing message permalinks). Known
  // synchronously for browser auth; null for standard tokens.
  getWorkspaceUrl(): string | null {
    if (this.config.auth_type === 'browser') {
      return this.config.workspace_url.replace(/\/$/, '');
    }
    return null;
  }

  // List conversations
  async listConversations(options: {
    types?: string;
    limit?: number;
    exclude_archived?: boolean;
    cursor?: string;
  } = {}): Promise<any> {
    return this.request('conversations.list', options);
  }

  // Get conversation history
  async getConversationHistory(channel: string, options: {
    cursor?: string;
    latest?: string;
    oldest?: string;
    inclusive?: boolean;
    limit?: number;
  } = {}): Promise<any> {
    // Filter out undefined values
    const params: Record<string, any> = { channel };
    if (options.cursor) params.cursor = options.cursor;
    if (options.latest) params.latest = options.latest;
    if (options.oldest) params.oldest = options.oldest;
    if (options.inclusive !== undefined) params.inclusive = options.inclusive;
    if (options.limit) params.limit = options.limit;
    
    return this.request('conversations.history', params);
  }

  // Get conversation replies (thread)
  async getConversationReplies(channel: string, ts: string, options: {
    cursor?: string;
    latest?: string;
    oldest?: string;
    inclusive?: boolean;
    limit?: number;
  } = {}): Promise<any> {
    const params: Record<string, any> = { channel, ts };
    if (options.cursor) params.cursor = options.cursor;
    if (options.latest) params.latest = options.latest;
    if (options.oldest) params.oldest = options.oldest;
    if (options.inclusive !== undefined) params.inclusive = options.inclusive;
    if (options.limit) params.limit = options.limit;
    
    return this.request('conversations.replies', params);
  }

  // Post message
  async postMessage(channel: string, text: string, options: {
    thread_ts?: string;
  } = {}): Promise<any> {
    const params: Record<string, any> = { channel, text };
    if (options.thread_ts) params.thread_ts = options.thread_ts;

    return this.request('chat.postMessage', params);
  }

  // Upload a file to a channel using the external upload flow
  async uploadFileExternal(channel: string, filePath: string, options: {
    initial_comment?: string;
    thread_ts?: string;
  } = {}): Promise<unknown> {
    const fileStats = await stat(filePath).catch((error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      throw error;
    });
    if (!fileStats.isFile()) {
      throw new Error(`Cannot upload non-file path: ${filePath}`);
    }
    if (fileStats.size === 0) {
      throw new Error(`Cannot upload empty file: ${filePath}`);
    }

    const filename = basename(filePath);
    const uploadUrlResponse = await this.request('files.getUploadURLExternal', {
      filename,
      length: fileStats.size,
    }) as ExternalUploadUrlResponse;

    if (!uploadUrlResponse.upload_url || !uploadUrlResponse.file_id) {
      throw new Error('Slack API error: missing upload URL or file ID');
    }

    // Stream the file straight from disk rather than buffering the whole
    // attachment into memory. Bun.file has a known size, so fetch sets
    // Content-Length correctly for the presigned upload.
    const uploadResponse = await fetch(uploadUrlResponse.upload_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: Bun.file(filePath),
    });

    if (!uploadResponse.ok) {
      throw new Error(`File upload failed: HTTP ${uploadResponse.status}`);
    }

    const params: Record<string, string> = {
      files: JSON.stringify([{ id: uploadUrlResponse.file_id, title: filename }]),
      channel_id: channel,
    };
    if (options.initial_comment) params.initial_comment = options.initial_comment;
    if (options.thread_ts) params.thread_ts = options.thread_ts;

    return this.request('files.completeUploadExternal', params);
  }

  // Get user info
  async getUserInfo(userId: string): Promise<any> {
    return this.request('users.info', { user: userId });
  }

  // Get multiple users info
  async getUsersInfo(userIds: string[]): Promise<any> {
    const users: any[] = [];
    
    for (const userId of userIds) {
      try {
        const response = await this.getUserInfo(userId);
        if (response.ok && response.user) {
          users.push(response.user);
        }
      } catch (error) {
        // Skip users we can't fetch
        console.error(`Failed to fetch user ${userId}`);
      }
    }
    
    return { ok: true, users };
  }

  // Open a conversation (DM)
  async openConversation(users: string): Promise<any> {
    return this.request('conversations.open', { users });
  }

  // Add a reaction (emoji) to a message
  async addReaction(channel: string, timestamp: string, name: string): Promise<any> {
    return this.request('reactions.add', {
      channel,
      timestamp,
      name,
    });
  }

  // Remove a reaction (emoji) from a message
  async removeReaction(channel: string, timestamp: string, name: string): Promise<any> {
    return this.request('reactions.remove', {
      channel,
      timestamp,
      name,
    });
  }

  // List files
  async listFiles(options: {
    channel?: string;
    user?: string;
    types?: string;
    count?: number;
    page?: number;
  } = {}): Promise<any> {
    const params: Record<string, any> = {};
    if (options.channel) params.channel = options.channel;
    if (options.user) params.user = options.user;
    if (options.types) params.types = options.types;
    if (options.count) params.count = options.count;
    if (options.page) params.page = options.page;

    return this.request('files.list', params);
  }

  // Get metadata for a single file (includes transcription status + vtt url)
  async getFileInfo(fileId: string): Promise<any> {
    return this.request('files.info', { file: fileId });
  }

  // Trigger (or re-trigger) transcription for a video file. This is the API
  // the "Generate transcript" button calls; Slack does not auto-transcribe
  // DM/channel videos, so transcription.status stays "none" until this runs.
  async retranscribeFile(fileId: string): Promise<any> {
    return this.request('files.retranscribe', { file_id: fileId });
  }

  // Search messages
  async searchMessages(query: string, options: {
    count?: number;
    page?: number;
    sort?: 'score' | 'timestamp';
    sort_dir?: 'asc' | 'desc';
  } = {}): Promise<any> {
    const params: Record<string, any> = { query };
    if (options.count) params.count = options.count;
    if (options.page) params.page = options.page;
    if (options.sort) params.sort = options.sort;
    if (options.sort_dir) params.sort_dir = options.sort_dir;

    return this.request('search.messages', params);
  }

  // Search files
  async searchFiles(query: string, options: {
    count?: number;
    page?: number;
    sort?: 'score' | 'timestamp';
    sort_dir?: 'asc' | 'desc';
  } = {}): Promise<any> {
    const params: Record<string, any> = { query };
    if (options.count) params.count = options.count;
    if (options.page) params.page = options.page;
    if (options.sort) params.sort = options.sort;
    if (options.sort_dir) params.sort_dir = options.sort_dir;

    return this.request('search.files', params);
  }

  // Get headers for file requests (shared by fetchFileContent and fetchFileBinary)
  private getFileHeaders(): Record<string, string> {
    if (this.config.auth_type === 'standard') {
      return {
        'Authorization': `Bearer ${this.config.token}`,
        'User-Agent': 'Mozilla/5.0 (compatible; SlackCLI/0.1.0)',
      };
    } else {
      const encodedXoxdToken = encodeURIComponent(
        (this.config as any).xoxd_token
      );
      return {
        'Cookie': `d=${encodedXoxdToken}`,
        'User-Agent': 'Mozilla/5.0 (compatible; SlackCLI/0.1.0)',
      };
    }
  }

  // Fetch file content as text (for VTT transcripts, etc.)
  async fetchFileContent(url: string): Promise<string> {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getFileHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.text();
    } catch (error: any) {
      throw new Error(`Failed to fetch file: ${error.message}`);
    }
  }

  // Fetch file content as binary (for images, documents, etc.)
  async fetchFileBinary(url: string): Promise<ArrayBuffer> {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getFileHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.arrayBuffer();
    } catch (error: any) {
      throw new Error(`Failed to fetch file: ${error.message}`);
    }
  }

  // List drafts (browser auth only)
  // By default returns only active drafts using is_active=true filter
  async listDrafts(options: { all?: boolean } = {}): Promise<any> {
    if (this.config.auth_type !== 'browser') {
      throw new Error('Drafts API requires browser authentication (xoxc/xoxd tokens)');
    }
    const params: Record<string, any> = { limit: '100' };
    if (!options.all) {
      params.is_active = 'true';
    }
    return this.request('drafts.list', params);
  }

  // Create a draft (browser auth only)
  // Pass threadTs (the parent message's ts) to place the draft inside a thread;
  // Slack carries the threading on the destination object, not as a top-level param.
  async createDraft(options: {
    channelId: string;
    text: string;
    threadTs?: string;
  }): Promise<any> {
    if (this.config.auth_type !== 'browser') {
      throw new Error('Drafts API requires browser authentication (xoxc/xoxd tokens)');
    }

    // Generate a UUID for client_msg_id (required by API)
    const clientMsgId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });

    // Create Block Kit formatted content
    const blocks = JSON.stringify([{
      type: 'rich_text',
      elements: [{
        type: 'rich_text_section',
        elements: [{ type: 'text', text: options.text }]
      }]
    }]);

    const destination: Record<string, any> = { channel_id: options.channelId };
    if (options.threadTs) destination.thread_ts = options.threadTs;
    const destinations = JSON.stringify([destination]);

    return this.request('drafts.create', {
      blocks,
      destinations,
      file_ids: '[]',
      attachments: '',
      is_from_composer: 'false',
      client_msg_id: clientMsgId,
    });
  }

  // Delete a draft (browser auth only)
  async deleteDraft(draftId: string): Promise<any> {
    if (this.config.auth_type !== 'browser') {
      throw new Error('Drafts API requires browser authentication (xoxc/xoxd tokens)');
    }

    // client_last_updated_ts is required - use current timestamp
    const clientLastUpdatedTs = `${Date.now()}.${Math.floor(Math.random() * 10000)}`;

    return this.request('drafts.delete', {
      draft_id: draftId,
      client_last_updated_ts: clientLastUpdatedTs,
      skip_file_deletion: 'false',
    });
  }
}

