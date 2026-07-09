import { describe, expect, it } from 'bun:test';
import { describeDraftError } from './drafts.ts';

describe('describeDraftError', () => {
  it('maps the raw attached_draft_exists code to a friendly message + actionable hint', () => {
    const friendly = describeDraftError('Slack API error: attached_draft_exists');
    expect(friendly).not.toBeNull();
    expect(friendly!.message).toContain('one draft per thread');
    // The hint points the user at the recovery path.
    expect(friendly!.hint).toContain('drafts list');
    expect(friendly!.hint).toContain('drafts delete');
  });

  it('returns null for unrelated errors so the raw message is preserved', () => {
    expect(describeDraftError('Slack API error: not_authed')).toBeNull();
    expect(describeDraftError('some network failure')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(describeDraftError(undefined)).toBeNull();
    expect(describeDraftError(new Error('boom'))).toBeNull();
  });
});
