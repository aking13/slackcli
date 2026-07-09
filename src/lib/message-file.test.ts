import { describe, expect, test } from 'bun:test';
import { pickMessageFile } from './message-file.ts';

describe('pickMessageFile', () => {
  const parent = { ts: '100.1', files: [{ id: 'FPARENT', mimetype: 'image/png' }] };
  const reply = { ts: '200.2', files: [{ id: 'FVIDEO', mimetype: 'video/mp4' }] };
  const messages = [parent, reply];

  test('returns the file on the exactly-matching message', () => {
    expect(pickMessageFile(messages, '200.2')).toEqual({ status: 'ok', file: reply.files[0] });
  });

  test('does NOT fall back to another message when the ts is absent', () => {
    // The wrong-media bug this guards against: previously the resolver could
    // substitute the thread parent / first message.
    expect(pickMessageFile(messages, '999.9')).toEqual({ status: 'no-message' });
  });

  test('prefers the video file when a message has several attachments', () => {
    const msg = { ts: '5.5', files: [{ id: 'FDOC', mimetype: 'application/pdf' }, { id: 'FVID', mimetype: 'video/mp4' }] };
    expect(pickMessageFile([msg], '5.5')).toEqual({ status: 'ok', file: msg.files[1] });
  });

  test('reports no-file when the matched message has no attachment', () => {
    expect(pickMessageFile([{ ts: '7.7' }], '7.7')).toEqual({ status: 'no-file' });
  });

  test('matches by exact string ts, not a numeric coincidence', () => {
    const msg = { ts: '1783532497.537739', files: [{ id: 'FX', mimetype: 'video/mp4' }] };
    expect(pickMessageFile([msg], '1783532497.5377390').status).toBe('no-message');
    expect(pickMessageFile([msg], '1783532497.537739').status).toBe('ok');
  });
});
