/**
 * Note history.
 *
 * NoteGeek had none, which made every in-place rewrite permanently
 * unrecoverable — most sharply on 2026-09-21, when Tidy truncated a long note
 * to ~63% of itself and wrote the stump back with nothing to restore from.
 *
 * The properties that matter, in order:
 *   1. a change is snapshotted, and a no-op change is not
 *   2. a version belongs to its owner and to nobody else
 *   3. a restore is itself undoable
 *   4. a failed snapshot never costs the user their edit
 */
import { jest } from '@jest/globals';
import {
  isMeaningfulChange,
  snapshotNote,
  listNoteVersions,
  getNoteVersion,
  deleteVersionsForNote,
  pruneVersions,
} from '../graphql/notegeek/versions.js';
import NoteVersion, { MAX_VERSIONS_PER_NOTE } from '../graphql/notegeek/models/NoteVersion.js';

const OWNER = '507f1f77bcf86cd799439011';
const STRANGER = '507f1f77bcf86cd799439022';
const NOTE = '507f1f77bcf86cd799439033';

const note = (over = {}) => ({
  _id: NOTE,
  userId: OWNER,
  title: 'Roof',
  content: 'call the roofer',
  type: 'markdown',
  tags: ['house'],
  isLocked: false,
  isEncrypted: false,
  ...over,
});

afterEach(async () => {
  await NoteVersion.deleteMany({});
  jest.restoreAllMocks();
});

describe('isMeaningfulChange', () => {
  test('content edited', () => {
    expect(isMeaningfulChange(note(), { content: 'call the roofer back' })).toBe(true);
  });

  test('title or type changed counts too', () => {
    // Losing either is just as annoying and just as unrecoverable.
    expect(isMeaningfulChange(note(), { title: 'Roofing' })).toBe(true);
    expect(isMeaningfulChange(note(), { type: 'text' })).toBe(true);
  });

  test('a save that changes nothing is NOT a version', () => {
    // Autosave on focus loss, an idempotent AI result, a re-save of the same
    // text — these would otherwise scroll the real history out of retention.
    expect(isMeaningfulChange(note(), { content: 'call the roofer' })).toBe(false);
    expect(isMeaningfulChange(note(), {})).toBe(false);
  });

  test('a tags-only change is not a version', () => {
    // Tags are cheap to redo and noisy to version.
    expect(isMeaningfulChange(note(), { tags: ['house', 'urgent'] })).toBe(false);
  });

  test('no previous note means nothing to snapshot', () => {
    expect(isMeaningfulChange(null, { content: 'x' })).toBe(false);
  });
});

describe('snapshotNote', () => {
  test('keeps the note as it was, with its label', async () => {
    const stored = await snapshotNote(note(), 'compose');
    expect(stored.content).toBe('call the roofer');
    expect(stored.reason).toBe('compose');
    expect(String(stored.noteId)).toBe(NOTE);
  });

  test('defaults the label to a plain edit', async () => {
    const stored = await snapshotNote(note());
    expect(stored.reason).toBe('edit');
  });

  test('carries lock and encryption flags through', async () => {
    // An encrypted note's content is ciphertext in both places, so a restore
    // round-trips without the server ever holding plaintext.
    const stored = await snapshotNote(note({ isEncrypted: true, isLocked: true, content: 'U2FsdGVk...' }));
    expect(stored.isEncrypted).toBe(true);
    expect(stored.isLocked).toBe(true);
    expect(stored.content).toBe('U2FsdGVk...');
  });

  test('a failed snapshot returns null rather than throwing', async () => {
    // Losing a history entry is bad; losing the user's edit because the
    // history entry failed is worse.
    jest.spyOn(NoteVersion, 'create').mockRejectedValue(new Error('mongo down'));
    await expect(snapshotNote(note())).resolves.toBeNull();
  });

  test('ignores a note with no id or no owner', async () => {
    await expect(snapshotNote({ content: 'orphan' })).resolves.toBeNull();
    await expect(snapshotNote(null)).resolves.toBeNull();
  });
});

describe('ownership', () => {
  test('a stranger sees no history', async () => {
    await snapshotNote(note());
    expect(await listNoteVersions({ noteId: NOTE, userId: STRANGER })).toHaveLength(0);
  });

  test('a stranger cannot fetch a version by id', async () => {
    const stored = await snapshotNote(note());
    expect(await getNoteVersion({ versionId: stored._id, userId: STRANGER })).toBeNull();
    expect(await getNoteVersion({ versionId: stored._id, userId: OWNER })).not.toBeNull();
  });

  test('the owner sees their own', async () => {
    await snapshotNote(note());
    const list = await listNoteVersions({ noteId: NOTE, userId: OWNER });
    expect(list).toHaveLength(1);
  });
});

describe('the list is a list, not a payload dump', () => {
  test('omits content, which is fetched one at a time', async () => {
    await snapshotNote(note({ content: 'x'.repeat(5000) }));
    const [row] = await listNoteVersions({ noteId: NOTE, userId: OWNER });
    expect(row.content).toBeUndefined();
    expect(row.title).toBe('Roof');
  });

  test('newest first', async () => {
    await snapshotNote(note({ content: 'first' }));
    await new Promise((r) => setTimeout(r, 10));
    await snapshotNote(note({ content: 'second' }));
    const list = await listNoteVersions({ noteId: NOTE, userId: OWNER });
    const newest = await getNoteVersion({ versionId: list[0]._id, userId: OWNER });
    expect(newest.content).toBe('second');
  });
});

describe('retention', () => {
  test('keeps the newest N and drops the rest', async () => {
    for (let i = 0; i < MAX_VERSIONS_PER_NOTE + 5; i += 1) {
      await snapshotNote(note({ content: `v${i}` }));
    }
    const count = await NoteVersion.countDocuments({ noteId: NOTE });
    expect(count).toBeLessThanOrEqual(MAX_VERSIONS_PER_NOTE);
  });

  test('pruning is best-effort and never throws', async () => {
    jest.spyOn(NoteVersion, 'find').mockImplementation(() => { throw new Error('mongo down'); });
    await expect(pruneVersions(NOTE)).resolves.toBe(0);
  });
});

describe('deleting a note takes its history', () => {
  test('because otherwise delete did not delete', async () => {
    await snapshotNote(note());
    await snapshotNote(note({ content: 'later' }));
    const removed = await deleteVersionsForNote(NOTE, OWNER);
    expect(removed).toBe(2);
    expect(await NoteVersion.countDocuments({ noteId: NOTE })).toBe(0);
  });

  test('a stranger cannot delete someone else\'s history', async () => {
    await snapshotNote(note());
    expect(await deleteVersionsForNote(NOTE, STRANGER)).toBe(0);
    expect(await NoteVersion.countDocuments({ noteId: NOTE })).toBe(1);
  });
});
