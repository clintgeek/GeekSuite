import { create } from 'zustand';

/**
 * What the editor tells the chrome around it.
 *
 *   writing    the caret is in a note's title or body. On a phone the suite
 *              top bar tucks away while this is true (Header.jsx), so the
 *              page gets the room, and the formatting toolbar docks above
 *              the keyboard (editors/EditorToolbar.jsx).
 *   saveAlert  a LOUD save status ({ label, detail }) — a failed save, or
 *              unsaved work while offline — or null when things are fine.
 *              The docked toolbar repeats it, because on a phone the note's
 *              own head has scrolled away by the time you are typing.
 *   retrySave  the page's save, for the alert's Retry.
 *   alertInView  the head's own SaveAlert is on screen (IntersectionObserver
 *              in SaveAlert's `reportInView`). The docked copy shows only
 *              while it is not, so a failed save is said once, not three
 *              times (review 2026-11-18, #3).
 */
const useEditorChrome = create((set) => ({
  writing: false,
  saveAlert: null,
  retrySave: null,
  alertInView: false,
  setWriting: (writing) => set((s) => (s.writing === writing ? s : { writing })),
  setSaveAlert: (saveAlert, retrySave = null) => set({ saveAlert, retrySave }),
  setAlertInView: (alertInView) => set((s) => (s.alertInView === alertInView ? s : { alertInView })),
  reset: () => set({ writing: false, saveAlert: null, retrySave: null, alertInView: false }),
}));

export default useEditorChrome;
