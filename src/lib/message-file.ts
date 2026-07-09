// Select a file from a list of Slack messages by EXACT ts.
//
// This never substitutes a different message: returning the wrong video is the
// failure mode `files transcript` exists to prevent, so an absent/typo'd ts
// resolves to `no-message` (a loud failure) rather than the thread parent or
// the first message.

export interface SlackMessageFile {
  id: string;
  mimetype?: string;
}

export interface SlackMessageLike {
  ts?: string;
  files?: SlackMessageFile[];
}

export type PickResult =
  | { status: 'ok'; file: SlackMessageFile }
  | { status: 'no-message' }
  | { status: 'no-file' };

/** Pick the file from the message whose ts EXACTLY equals `ts`, preferring a
 *  video attachment when the message carries several. */
export function pickMessageFile(messages: SlackMessageLike[], ts: string): PickResult {
  const msg = messages.find((m) => m.ts === ts);
  if (!msg) return { status: 'no-message' };
  const files = msg.files || [];
  const file = files.find((f) => (f.mimetype || '').startsWith('video/')) || files[0];
  if (!file) return { status: 'no-file' };
  return { status: 'ok', file };
}
