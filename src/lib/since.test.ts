import { describe, expect, test } from 'bun:test';
import { parseSince, dateToSlackTs, slackTsToIso } from './since.ts';

const NOW = new Date('2026-07-07T11:05:00Z'); // a Tuesday

describe('parseSince', () => {
  test('working days skip weekends', () => {
    // Tue Jul 7 back 7 working days: Mon 6, Fri 3, Thu 2, Wed 1, Tue Jun 30,
    // Mon 29, Fri 26 → 2026-06-26T00:00:00Z
    expect(parseSince('7wd', NOW).toISOString()).toBe('2026-06-26T00:00:00.000Z');
    expect(parseSince('1wd', NOW).toISOString()).toBe('2026-07-06T00:00:00.000Z');
  });

  test('durations', () => {
    expect(parseSince('7d', NOW).toISOString()).toBe('2026-06-30T11:05:00.000Z');
    expect(parseSince('36h', NOW).toISOString()).toBe('2026-07-05T23:05:00.000Z');
    expect(parseSince('2w', NOW).toISOString()).toBe('2026-06-23T11:05:00.000Z');
  });

  test('ISO date is UTC midnight', () => {
    expect(parseSince('2026-07-05', NOW).toISOString()).toBe('2026-07-05T00:00:00.000Z');
  });

  test('ISO datetime passes through', () => {
    expect(parseSince('2026-07-06T21:12:47Z', NOW).toISOString()).toBe('2026-07-06T21:12:47.000Z');
  });

  test('garbage throws', () => {
    expect(() => parseSince('yesterday', NOW)).toThrow(/Unparseable --since/);
  });
});

describe('ts conversions', () => {
  test('dateToSlackTs round-trips through slackTsToIso', () => {
    const ts = dateToSlackTs(new Date('2026-07-05T00:00:00Z'));
    expect(slackTsToIso(ts)).toBe('2026-07-05T00:00:00Z');
  });
  test('slackTsToIso', () => {
    expect(slackTsToIso('1783331802.618659')).toBe('2026-07-06T09:56:42Z');
  });
});
