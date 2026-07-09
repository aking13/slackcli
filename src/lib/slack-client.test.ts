import { describe, expect, it } from 'bun:test';
import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { SlackClient } from './slack-client.ts';
import type { BrowserAuthConfig, StandardAuthConfig } from '../types/index.ts';

const browserConfig: BrowserAuthConfig = {
  workspace_id: 'T123',
  workspace_name: 'test',
  workspace_url: 'https://test.slack.com',
  auth_type: 'browser',
  xoxd_token: 'xoxd-test',
  xoxc_token: 'xoxc-test',
};

function clientWithCapturedRequest(): { client: SlackClient; calls: Array<{ method: string; params: any }> } {
  const client = new SlackClient(browserConfig);
  const calls: Array<{ method: string; params: any }> = [];
  // Stub the transport so no real network call is made.
  client.request = async (method: string, params: Record<string, any> = {}) => {
    calls.push({ method, params });
    return { ok: true };
  };
  return { client, calls };
}

describe('SlackClient reactions', () => {
  it('addReaction calls reactions.add with channel, timestamp, and name', async () => {
    const { client, calls } = clientWithCapturedRequest();

    await client.addReaction('C123', '1744346513.339549', 'thumbsup');

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('reactions.add');
    expect(calls[0].params).toEqual({
      channel: 'C123',
      timestamp: '1744346513.339549',
      name: 'thumbsup',
    });
  });

  it('removeReaction calls reactions.remove with channel, timestamp, and name', async () => {
    const { client, calls } = clientWithCapturedRequest();

    await client.removeReaction('C123', '1744346513.339549', 'heart');

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('reactions.remove');
    expect(calls[0].params).toEqual({
      channel: 'C123',
      timestamp: '1744346513.339549',
      name: 'heart',
    });
  });
});

describe('SlackClient uploadFileExternal', () => {
  it('runs the external upload flow: get URL, PUT bytes, complete upload', async () => {
    const tmp = join(tmpdir(), `slackcli-upload-test-${process.pid}-${globalThis.performance.now()}.txt`);
    writeFileSync(tmp, 'hello file'); // 10 bytes

    const client = new SlackClient(browserConfig);
    const calls: Array<{ method: string; params: any }> = [];
    client.request = async (method: string, params: Record<string, any> = {}) => {
      calls.push({ method, params });
      if (method === 'files.getUploadURLExternal') {
        return { upload_url: 'https://files.slack.com/upload/abc', file_id: 'F123' };
      }
      return { ok: true };
    };

    let fetchedUrl: string | undefined;
    let fetchInit: RequestInit | undefined;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      fetchedUrl = url;
      fetchInit = init;
      return { ok: true, status: 200 } as Response;
    }) as typeof fetch;

    let sentBody: string | undefined;
    try {
      await client.uploadFileExternal('C123', tmp, { initial_comment: 'caption', thread_ts: '1.1' });
      // Read back whatever was handed to fetch as the body to prove the real
      // file bytes are streamed (Bun.file exposes .text()).
      const body: any = fetchInit?.body;
      sentBody = typeof body?.text === 'function' ? await body.text() : new TextDecoder().decode(body);
    } finally {
      globalThis.fetch = originalFetch;
      rmSync(tmp);
    }

    expect(calls[0].method).toBe('files.getUploadURLExternal');
    expect(calls[0].params.filename).toBe(basename(tmp));
    expect(calls[0].params.length).toBe(10);
    expect(fetchedUrl).toBe('https://files.slack.com/upload/abc');
    // The upload must be a POST that carries the actual file content.
    expect(fetchInit?.method).toBe('POST');
    expect((fetchInit?.headers as Record<string, string>)['Content-Type']).toBe('application/octet-stream');
    expect(sentBody).toBe('hello file');
    expect(calls[1].method).toBe('files.completeUploadExternal');
    expect(calls[1].params.channel_id).toBe('C123');
    expect(calls[1].params.initial_comment).toBe('caption');
    expect(calls[1].params.thread_ts).toBe('1.1');
    expect(JSON.parse(calls[1].params.files)).toEqual([{ id: 'F123', title: basename(tmp) }]);
  });

  it('throws a clear error when the file does not exist, before any API call', async () => {
    const client = new SlackClient(browserConfig);
    let requestCalled = false;
    client.request = async () => {
      requestCalled = true;
      return {};
    };

    await expect(
      client.uploadFileExternal('C123', join(tmpdir(), 'slackcli-does-not-exist-xyz.txt')),
    ).rejects.toThrow('File not found');
    expect(requestCalled).toBe(false);
  });
});

describe('SlackClient uploadUnsharedFile', () => {
  it('completes the upload without a channel_id and returns the file id', async () => {
    const tmp = join(tmpdir(), `slackcli-unshared-test-${process.pid}-${globalThis.performance.now()}.txt`);
    writeFileSync(tmp, 'hello file'); // 10 bytes

    const client = new SlackClient(browserConfig);
    const calls: Array<{ method: string; params: any }> = [];
    client.request = async (method: string, params: Record<string, any> = {}) => {
      calls.push({ method, params });
      if (method === 'files.getUploadURLExternal') {
        return { upload_url: 'https://files.slack.com/upload/abc', file_id: 'F123' };
      }
      return { ok: true };
    };

    let fetchInit: RequestInit | undefined;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      fetchInit = init;
      return { ok: true, status: 200 } as Response;
    }) as typeof fetch;

    let fileId: string;
    try {
      fileId = await client.uploadUnsharedFile(tmp);
    } finally {
      globalThis.fetch = originalFetch;
      rmSync(tmp);
    }

    expect(fileId).toBe('F123');
    expect(calls[0].method).toBe('files.getUploadURLExternal');
    expect(calls[0].params.length).toBe(10);
    expect(fetchInit?.method).toBe('POST');
    expect(calls[1].method).toBe('files.completeUploadExternal');
    // The file must NOT be shared to any conversation.
    expect(calls[1].params.channel_id).toBeUndefined();
    expect(JSON.parse(calls[1].params.files)).toEqual([{ id: 'F123', title: basename(tmp) }]);
  });

  it('requires browser authentication before touching Slack or the filesystem', async () => {
    const standardConfig: StandardAuthConfig = {
      workspace_id: 'T123',
      workspace_name: 'test',
      auth_type: 'standard',
      token: 'xoxb-test',
      token_type: 'bot',
    };
    const client = new SlackClient(standardConfig);
    let requestCalled = false;
    client.request = async () => {
      requestCalled = true;
      return { ok: true };
    };
    let fetchCalled = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string, _init?: RequestInit) => {
      fetchCalled = true;
      return { ok: true, status: 200 } as Response;
    }) as typeof fetch;

    try {
      // A real file: proves the auth check fails first, not the file check.
      const tmp = join(tmpdir(), `slackcli-unshared-auth-${process.pid}-${globalThis.performance.now()}.txt`);
      writeFileSync(tmp, 'x');
      try {
        await expect(client.uploadUnsharedFile(tmp)).rejects.toThrow('browser authentication');
      } finally {
        rmSync(tmp);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }

    // No file was uploaded — the whole point of guarding before the upload.
    expect(requestCalled).toBe(false);
    expect(fetchCalled).toBe(false);
  });
});

describe('SlackClient createDraft', () => {
  it('calls drafts.create with a destination carrying only the channel when no thread is given', async () => {
    const { client, calls } = clientWithCapturedRequest();

    await client.createDraft({ channelId: 'D08PRF1T8BE', text: 'hello' });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('drafts.create');
    expect(JSON.parse(calls[0].params.destinations)).toEqual([{ channel_id: 'D08PRF1T8BE' }]);
    // The text is carried inside the rich_text block, not as a top-level param.
    const blocks = JSON.parse(calls[0].params.blocks);
    expect(blocks[0].elements[0].elements[0].text).toBe('hello');
  });

  it('threads the draft by putting thread_ts on the destination when provided', async () => {
    const { client, calls } = clientWithCapturedRequest();

    await client.createDraft({
      channelId: 'D08PRF1T8BE',
      text: 'threaded reply',
      threadTs: '1783528413.764109',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('drafts.create');
    expect(JSON.parse(calls[0].params.destinations)).toEqual([
      { channel_id: 'D08PRF1T8BE', thread_ts: '1783528413.764109' },
    ]);
  });

  it('defaults file_ids to an empty JSON array when no attachments are given', async () => {
    const { client, calls } = clientWithCapturedRequest();

    await client.createDraft({ channelId: 'D08PRF1T8BE', text: 'hello' });

    expect(calls[0].params.file_ids).toBe('[]');
  });

  it('carries attachment file ids into file_ids as a JSON array', async () => {
    const { client, calls } = clientWithCapturedRequest();

    await client.createDraft({
      channelId: 'D08PRF1T8BE',
      text: 'with attachments',
      fileIds: ['F111', 'F222'],
    });

    expect(JSON.parse(calls[0].params.file_ids)).toEqual(['F111', 'F222']);
  });

  it('requires browser authentication', async () => {
    const standardConfig: StandardAuthConfig = {
      workspace_id: 'T123',
      workspace_name: 'test',
      auth_type: 'standard',
      token: 'xoxb-test',
      token_type: 'bot',
    };
    const client = new SlackClient(standardConfig);
    let requestCalled = false;
    client.request = async () => {
      requestCalled = true;
      return { ok: true };
    };

    await expect(
      client.createDraft({ channelId: 'C123', text: 'nope' }),
    ).rejects.toThrow('browser authentication');
    expect(requestCalled).toBe(false);
  });
});
