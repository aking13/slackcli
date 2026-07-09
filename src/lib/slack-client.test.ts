import { describe, expect, it } from 'bun:test';
import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { SlackClient } from './slack-client.ts';
import type { BrowserAuthConfig } from '../types/index.ts';

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
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      fetchedUrl = url;
      return { ok: true, status: 200 } as Response;
    }) as typeof fetch;

    try {
      await client.uploadFileExternal('C123', tmp, { initial_comment: 'caption', thread_ts: '1.1' });
    } finally {
      globalThis.fetch = originalFetch;
      rmSync(tmp);
    }

    expect(calls[0].method).toBe('files.getUploadURLExternal');
    expect(calls[0].params.filename).toBe(basename(tmp));
    expect(calls[0].params.length).toBe(10);
    expect(fetchedUrl).toBe('https://files.slack.com/upload/abc');
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
