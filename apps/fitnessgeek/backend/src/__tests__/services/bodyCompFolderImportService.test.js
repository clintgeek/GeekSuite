// bodyCompFolderImportService.test.js — the Nextcloud drop folder
// (DOCS/BODY_COMPOSITION_INTAKE.md §11), run against a REAL temp directory and
// a copy of the real export. The import itself (bodyCompXlsxImportService) and
// the ledger model are mocked at the boundary: the import has its own suite,
// and this suite has no live database. What is under test is the part that
// decides WHEN and WHETHER a file is imported — and that the folder is never
// written to.

const mod = (p) => new URL(p, import.meta.url).pathname;

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

let ledger;

jest.unstable_mockModule(mod('../../models/BodyCompImportFile.js'), () => {
  const BodyCompImportFile = jest.fn();
  BodyCompImportFile.exists = jest.fn(async ({ userId, sha256 }) =>
    ledger.some((e) => e.userId === userId && e.sha256 === sha256));
  BodyCompImportFile.create = jest.fn(async (doc) => {
    if (ledger.some((e) => e.userId === doc.userId && e.sha256 === doc.sha256)) {
      const error = new Error('E11000');
      error.code = 11000;
      throw error;
    }
    ledger.push(doc);
    return doc;
  });
  return { __esModule: true, default: BodyCompImportFile };
});

const RESULT = { imported: 6, skipped: 0, failed: 0, results: [], weights: { created: 6 } };
jest.unstable_mockModule(mod('../../services/bodyCompXlsxImportService.js'), () => ({
  __esModule: true,
  importBodyCompXlsxUpload: jest.fn(async ({ buffer }) => {
    // Stand-in for `parseBodyCompXlsx` rejecting a non-workbook.
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw new Error('not an xlsx workbook');
    return RESULT;
  }),
  default: {},
}));

const { importBodyCompXlsxUpload } = await import('../../services/bodyCompXlsxImportService.js');
const {
  parseImportFolders, isCandidateFile, processFile, startBodyCompFolderImport,
} = await import('../../services/bodyCompFolderImportService.js');

const REAL_EXPORT = await fs.readFile(path.resolve(process.cwd(), '../../../DOCS/body_comp.xlsx'));
const FAST = { intervalMs: 5, attempts: 20 };

let root;
let dir;
const folderEntry = { folder: 'clint-imports', userId: 'user-1' };

const put = async (name, bytes = REAL_EXPORT) => fs.writeFile(path.join(dir, name), bytes);
const listing = async () => (await fs.readdir(dir)).sort();
const waitFor = async (predicate, ms = 3000) => {
  const until = Date.now() + ms;
  while (!predicate()) {
    if (Date.now() > until) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 10));
  }
};

beforeEach(async () => {
  ledger = [];
  importBodyCompXlsxUpload.mockClear();
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'fitnessgeek-folder-import-'));
  dir = path.join(root, 'clint-imports');
  await fs.mkdir(dir);
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('parseImportFolders', () => {
  test('folder:userId pairs, whitespace tolerated', () => {
    expect(parseImportFolders(' clint-imports:u1 , other:u2 ')).toEqual([
      { folder: 'clint-imports', userId: 'u1' },
      { folder: 'other', userId: 'u2' },
    ]);
  });

  test('unset or blank -> nothing', () => {
    expect(parseImportFolders(undefined)).toEqual([]);
    expect(parseImportFolders('  ')).toEqual([]);
  });

  test('a folder can never be a path — traversal and nesting are dropped', () => {
    expect(parseImportFolders('../etc:u1,a/b:u2,..:u3,.:u4,nouser:,:nofolder,ok:u5')).toEqual([
      { folder: 'ok', userId: 'u5' },
    ]);
  });
});

describe('isCandidateFile', () => {
  test.each([
    ['Body Composition-x@y.com-arboleaf-20260922111021.xlsx', true],
    ['EXPORT.XLSX', true],
    ['Body Composition.xlsx.ocTransferId123.part', false],
    ['.~lock.export.xlsx#', false],
    ['.hidden.xlsx', false],
    ['report.pdf', false],
    ['', false],
  ])('%s -> %s', (name, expected) => {
    expect(isCandidateFile(name)).toBe(expected);
  });
});

describe('processFile', () => {
  test('imports a new export and records it in the ledger by content hash', async () => {
    await put('a.xlsx');
    expect(await processFile({ root, ...folderEntry, filename: 'a.xlsx', settle: FAST })).toBe('imported');
    expect(importBodyCompXlsxUpload).toHaveBeenCalledWith({ buffer: REAL_EXPORT, userId: 'user-1' });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      userId: 'user-1', folder: 'clint-imports', filename: 'a.xlsx', status: 'imported',
      counts: { imported: 6, skipped: 0, failed: 0 }, weights: { created: 6 },
    });
    expect(ledger[0].sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  test('the same content under a new name is already handled — a rename is not a new file', async () => {
    await put('a.xlsx');
    await put('renamed.xlsx');
    await processFile({ root, ...folderEntry, filename: 'a.xlsx', settle: FAST });
    expect(await processFile({ root, ...folderEntry, filename: 'renamed.xlsx', settle: FAST })).toBe('already');
    expect(importBodyCompXlsxUpload).toHaveBeenCalledTimes(1);
  });

  test('the same content for a DIFFERENT user is imported for them', async () => {
    await put('a.xlsx');
    await processFile({ root, ...folderEntry, filename: 'a.xlsx', settle: FAST });
    expect(await processFile({ root, folder: 'clint-imports', userId: 'user-2', filename: 'a.xlsx', settle: FAST }))
      .toBe('imported');
  });

  test('a file that is not a workbook is recorded as failed and not retried until it changes', async () => {
    await put('junk.xlsx', Buffer.from('definitely not a zip'));
    expect(await processFile({ root, ...folderEntry, filename: 'junk.xlsx', settle: FAST })).toBe('failed');
    expect(ledger[0]).toMatchObject({ status: 'failed', error: 'not an xlsx workbook' });

    expect(await processFile({ root, ...folderEntry, filename: 'junk.xlsx', settle: FAST })).toBe('already');
    expect(importBodyCompXlsxUpload).toHaveBeenCalledTimes(1);

    await put('junk.xlsx', REAL_EXPORT);
    expect(await processFile({ root, ...folderEntry, filename: 'junk.xlsx', settle: FAST })).toBe('imported');
  });

  test('a file that vanished before it settled is not_ready, and nothing is recorded', async () => {
    expect(await processFile({ root, ...folderEntry, filename: 'gone.xlsx', settle: FAST })).toBe('not_ready');
    expect(ledger).toHaveLength(0);
  });
});

describe('startBodyCompFolderImport', () => {
  test('no root -> off, and touches nothing', async () => {
    // Since per-user mode (2026-09-23) a root with no FOLDERS override is ON —
    // every subfolder is a user. Off means no root at all.
    await put('a.xlsx');
    const resolveUser = jest.fn(async () => 'user-1');
    const importer = startBodyCompFolderImport({ root: '', folders: '', resolveUser });
    await importer.idle();
    await importer.stop();
    expect(importBodyCompXlsxUpload).not.toHaveBeenCalled();
    expect(resolveUser).not.toHaveBeenCalled();
  });

  test('the boot scan imports what is already there and ignores in-progress uploads', async () => {
    await put('Body Composition-20260919.xlsx');
    await put('Body Composition-20260922.xlsx', Buffer.concat([REAL_EXPORT, Buffer.from(' ')]));
    await put('Body Composition-20260923.xlsx.ocTransferId9.part');
    const before = await listing();

    const importer = startBodyCompFolderImport({
      root, folders: 'clint-imports:user-1', settle: FAST, debounceMs: 10,
    });
    await importer.idle();
    await importer.stop();

    expect(importBodyCompXlsxUpload).toHaveBeenCalledTimes(2);
    expect(ledger.map((e) => e.filename).sort()).toEqual([
      'Body Composition-20260919.xlsx', 'Body Composition-20260922.xlsx',
    ]);
    // §11.3: the folder is Nextcloud's. Nothing moved, renamed or deleted.
    expect(await listing()).toEqual(before);
  });

  test('a boot after a restart re-imports nothing it already handled', async () => {
    await put('a.xlsx');
    const first = startBodyCompFolderImport({ root, folders: 'clint-imports:user-1', settle: FAST });
    await first.idle();
    await first.stop();

    const second = startBodyCompFolderImport({ root, folders: 'clint-imports:user-1', settle: FAST });
    await second.idle();
    await second.stop();
    expect(importBodyCompXlsxUpload).toHaveBeenCalledTimes(1);
  });

  test('the watcher imports a file that arrives after boot', async () => {
    const importer = startBodyCompFolderImport({
      root, folders: 'clint-imports:user-1', settle: FAST, debounceMs: 10,
    });
    await importer.idle();

    await put('new-export.xlsx');
    await waitFor(() => ledger.length === 1);
    await importer.stop();
    expect(ledger[0]).toMatchObject({ filename: 'new-export.xlsx', status: 'imported' });
  });

  test('the periodic rescan catches a file the watcher never reported', async () => {
    const missing = path.join(root, 'no-such-folder-yet');
    const importer = startBodyCompFolderImport({
      root, folders: 'no-such-folder-yet:user-1', settle: FAST, rescanMs: 50,
    });
    await importer.idle();
    // The folder didn't exist at boot, so there is no watch on it — only the
    // rescan can find this file.
    await fs.mkdir(missing);
    await fs.writeFile(path.join(missing, 'late.xlsx'), REAL_EXPORT);
    await waitFor(() => ledger.length === 1);
    await importer.stop();
    expect(ledger[0]).toMatchObject({ folder: 'no-such-folder-yet', filename: 'late.xlsx' });
  });
});

describe('per-user mode — every subfolder of the root is a user (§11.1, 2026-09-23)', () => {
  // Stand-in for the userGeek lookup: username or email, case-insensitive.
  const USERS = { 'clint@clintgeek.com': 'user-clint', heather: 'user-heather' };
  const resolveUser = async (name) => USERS[name.toLowerCase()] ?? null;

  const userDir = async (name) => {
    const d = path.join(root, name);
    await fs.mkdir(d, { recursive: true });
    return d;
  };

  test('imports each known user\'s folder for that user, and skips a folder nobody owns', async () => {
    await fs.writeFile(path.join(await userDir('clint@clintgeek.com'), 'a.xlsx'), REAL_EXPORT);
    await fs.writeFile(path.join(await userDir('Heather'), 'h.xlsx'), Buffer.concat([REAL_EXPORT, Buffer.from(' ')]));
    await fs.writeFile(path.join(await userDir('stranger'), 's.xlsx'), REAL_EXPORT);

    const importer = startBodyCompFolderImport({ root, settle: FAST, debounceMs: 10, resolveUser });
    await importer.idle();
    await importer.stop();

    expect(ledger.map((e) => [e.folder, e.userId]).sort()).toEqual([
      ['Heather', 'user-heather'],
      ['clint@clintgeek.com', 'user-clint'],
    ]);
    expect(importBodyCompXlsxUpload.mock.calls.map(([arg]) => arg.userId).sort()).toEqual(['user-clint', 'user-heather']);
  });

  test('a user folder created after boot is found and imported without a restart', async () => {
    const importer = startBodyCompFolderImport({ root, settle: FAST, debounceMs: 10, resolveUser });
    await importer.idle();

    const d = await userDir('heather');
    await fs.writeFile(path.join(d, 'late.xlsx'), REAL_EXPORT);
    await waitFor(() => ledger.length === 1);
    await importer.stop();
    expect(ledger[0]).toMatchObject({ folder: 'heather', userId: 'user-heather', filename: 'late.xlsx' });
  });

  test('a failed lookup skips the folder for now instead of stopping the importer', async () => {
    await fs.writeFile(path.join(await userDir('clint@clintgeek.com'), 'a.xlsx'), REAL_EXPORT);
    await userDir('heather');
    const flaky = async (name) => { if (name === 'heather') throw new Error('mongo down'); return resolveUser(name); };
    const importer = startBodyCompFolderImport({ root, settle: FAST, resolveUser: flaky });
    await importer.idle();
    await importer.stop();
    expect(ledger.map((e) => e.userId)).toEqual(['user-clint']);
  });

  test('files loose in the root, and dot-folders, are never treated as users', async () => {
    await fs.writeFile(path.join(root, 'loose.xlsx'), REAL_EXPORT);
    await userDir('.sync-cache');
    const seen = [];
    const importer = startBodyCompFolderImport({ root, settle: FAST, resolveUser: async (n) => { seen.push(n); return null; } });
    await importer.idle();
    await importer.stop();
    // `root` also holds the explicit-mode fixture folder; only it may be looked up.
    expect(seen.filter((n) => n !== 'clint-imports')).toEqual([]);
    expect(ledger).toHaveLength(0);
  });
});

