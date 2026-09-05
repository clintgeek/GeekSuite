// NoteGeek — the M2 pilot surfaces (MOBILE_UI_PLAN.md).
export const scenes = [
  // Home (QuickCaptureHome) — bottom nav visible with mono labels + ink-stamp.
  { name: '01-home', goto: '/', wait: 1200 },
  // Notes list — bottom nav still visible, "Notes" tab active.
  { name: '02-notes-list', goto: '/notes', wait: 1200 },
  // Editor route — an existing text note, so the sticky bar shows
  // Back + Save + Delete (a new note has no Delete). Toolbar + sticky bar.
  { name: '03-editor', goto: '/notes/n1/edit', wait: 1200 },
  {
    // Delete confirm — GeekDialog mode="window".
    name: '04-delete-dialog',
    goto: '/notes/n1/edit',
    wait: 1200,
    viewports: ['phone'],
    async setup(page, h) {
      const deleteBtn = page.getByRole('button', { name: /^delete$/i }).first();
      if (!(await deleteBtn.count())) {
        h.log('no "Delete" button found at', h.viewport, h.scheme);
        return false;
      }
      await deleteBtn.click();
      await h.settle(500);
    },
    teardown: (page, h) => h.esc(400),
  },
];

// Known, ticketed violations. Each one should die when the app is fixed —
// an empty list is the goal, not a permanent parking lot.
export const waivers = [];
