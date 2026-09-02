import { describe, it } from '@jest/globals';

// SKIP: controllers/folders.js and models/Folder.js were both deleted in the
// Phase 2 hardening pass. Folders were never mounted in server.js and were
// superseded by the tag-based folder migration
// (migrations/convertFoldersToTags.js). This suite is a placeholder — it
// must not import the deleted controller/model, since that import alone
// (even under describe.skip) would fail module resolution and crash the
// whole test file. The original per-handler test cases (createFolder,
// getFolders, updateFolder, deleteFolder) are preserved in git history at
// this file's prior revision if folders are ever reintroduced.
describe.skip('Folders Controller (deleted — superseded by tags)', () => {
    it('had no equivalent after the tag-based folder migration', () => {});
});
