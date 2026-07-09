import { describe, expect, it } from 'bun:test';
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
