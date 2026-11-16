/**
 * useTodoLayout — which of TodoGeek's three layouts this device gets
 * (tablet wave 3, 2026-11-16). One place, from the suite's `useFormFactor`
 * (pointer first, then size), instead of MUI's `md` width breakpoint, which
 * called an 800 px portrait tablet "a phone".
 *
 *   phone    bottom bar + drawer, docked add box, Reorder toggle, sheet editor
 *   tablet   the rail; portrait (one pane): docked add box beside the rail,
 *            grips always on, sheet editor, the date and tags next to the words
 *   twoPane  from 1024 px (landscape tablet, desktop): Today is list | task
 *
 * `docked`: the add box is pinned at the bottom (phone, portrait tablet).
 * `inlineWhen`: a row's time follows its words instead of sitting at the
 * far right edge (the tablet; the phone already puts it under the words).
 */
import { useFormFactor } from '@geeksuite/ui';

export function todoLayoutFor(ff) {
  const phone = ff.kind === 'phone';
  const tablet = ff.kind === 'tablet';
  const twoPane = Boolean(ff.twoPane);
  return {
    phone,
    tablet,
    desktop: ff.kind === 'desktop',
    twoPane,
    docked: phone || (tablet && !twoPane),
    inlineWhen: tablet,
  };
}

export default function useTodoLayout() {
  return todoLayoutFor(useFormFactor());
}
