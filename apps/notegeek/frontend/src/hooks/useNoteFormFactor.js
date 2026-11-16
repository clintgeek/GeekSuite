import { createContext, useContext } from 'react';
import { useFormFactor } from '@geeksuite/ui';

/**
 * What NoteGeek's layout follows (tablet wave, 2026-11-16).
 *
 * The app used to split on MUI's `md` (900 px): below it "phone", above it
 * "desktop". That made a portrait tablet (800 px, Chef's grip) a stretched
 * phone — bottom bar, docked toolbar — and a landscape touch tablet (1280 px)
 * a mouse desktop with 24 px targets. The suite's `useFormFactor` classifies
 * by pointer AND size instead (packages/ui/src/hooks/useFormFactor.js):
 *
 *   phone   — the bottom bar, the docked formatting toolbar, the tucked top bar
 *   tablet  — the rail, the inline toolbar under the title (800 portrait and
 *             1280 landscape alike, and a 600–1199 px mouse window)
 *   desktop — the sidebar, as before
 *
 * `twoPane` (from 1024 px) puts the notes list beside the note.
 *
 * Layout decisions use the hook; target SIZES use CSS on the pointer
 * (`geekTarget` / `geekMedia.coarse`), so they need no re-render.
 */
export function useNoteFormFactor() {
  return useFormFactor();
}

/** True only on a phone: the shapes that existed before the tablet wave. */
export function usePhoneLayout() {
  return useFormFactor().phone;
}

/**
 * "Phone", as CSS — the negation of `geekMedia.tabletUp`: under 600 wide, or
 * under 600 tall with a finger (a phone held sideways). For layout CSS that
 * used to say `theme.breakpoints.down('md')`.
 */
export const PHONE_MEDIA = '@media (max-width: 599.98px), (max-height: 599.98px) and (pointer: coarse)';

/**
 * The note open in the detail pane, so the list beside it can mark its row
 * (two-pane only; null everywhere else). Provided by Layout.
 */
export const CurrentNoteContext = createContext(null);

export function useCurrentNoteId() {
  return useContext(CurrentNoteContext);
}

/**
 * Where a control needs its 44 px finger target: everywhere it needed one
 * before (under `md`, 900 px) PLUS any coarse pointer at any width — a
 * 1280 px touch tablet in landscape is still a finger (tablet wave
 * 2026-11-16). Strictly additive: a phone and a narrow window keep exactly
 * what they had, a mouse on a desktop keeps its compact controls. New code
 * should prefer `geekTarget()` from @geeksuite/ui; this is the drop-in for
 * the old `[theme.breakpoints.down('md')]` target rules.
 */
export const TOUCH_TARGET_MEDIA = '@media (max-width: 899.95px), (pointer: coarse)';
