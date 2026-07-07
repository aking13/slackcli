// Parsing for the --since flag: turn a human window spec into a Slack
// `oldest` timestamp so callers never hand-roll epoch math.
//
// Accepted forms:
//   ISO date/datetime   2026-07-01 · 2026-07-01T12:00:00Z
//   durations           36h · 7d · 2w
//   working days        7wd  (calendar days back counting only Mon–Fri,
//                        landing at UTC midnight of the resulting day)

export function parseSince(spec: string, now: Date = new Date()): Date {
  let m = spec.match(/^(\d+)(h|d|w)$/);
  if (m) {
    const n = parseInt(m[1], 10);
    const unitMs = { h: 3600_000, d: 86400_000, w: 7 * 86400_000 }[m[2] as 'h' | 'd' | 'w']!;
    return new Date(now.getTime() - n * unitMs);
  }
  m = spec.match(/^(\d+)wd$/);
  if (m) {
    let remaining = parseInt(m[1], 10);
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    while (remaining > 0) {
      d.setUTCDate(d.getUTCDate() - 1);
      const dow = d.getUTCDay();
      if (dow >= 1 && dow <= 5) remaining--;
    }
    return d;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(spec)) return new Date(spec + 'T00:00:00Z');
  if (/^\d{4}-\d{2}-\d{2}T/.test(spec)) {
    const d = new Date(spec);
    if (!isNaN(d.getTime())) return d;
  }
  throw new Error(
    `Unparseable --since value: "${spec}". Use ISO (2026-07-01[T12:00:00Z]), a duration (36h, 7d, 2w), or working days (7wd).`,
  );
}

// Date → Slack ts string (seconds with microsecond precision).
export function dateToSlackTs(d: Date): string {
  return (d.getTime() / 1000).toFixed(6);
}

// Slack ts string → UTC ISO-8601 (second precision).
export function slackTsToIso(ts: string): string {
  const ms = Math.floor(parseFloat(ts) * 1000);
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}
