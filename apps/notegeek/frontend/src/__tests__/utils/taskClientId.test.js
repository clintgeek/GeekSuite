import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { taskClientId } from '../../utils/taskClientId';

// Contract C1: `ng:` + first 32 hex of sha-256(`${noteId}|${lineKey}`).
describe('taskClientId (C1)', () => {
  it('is ng: + the first 32 hex characters of sha-256(noteId|lineKey)', async () => {
    const want = `ng:${createHash('sha256').update('note-1|task:abc:12').digest('hex').slice(0, 32)}`;
    expect(await taskClientId('note-1', 'task:abc:12')).toBe(want);
  });

  it('is the same for the same line of the same sketch, different otherwise', async () => {
    expect(await taskClientId('n', 'k')).toBe(await taskClientId('n', 'k'));
    expect(await taskClientId('n', 'k')).not.toBe(await taskClientId('n', 'k2'));
    expect(await taskClientId('n2', 'k')).not.toBe(await taskClientId('n', 'k'));
  });

  it('is null without a note or a line', async () => {
    expect(await taskClientId(null, 'k')).toBeNull();
    expect(await taskClientId('n', '')).toBeNull();
  });
});
