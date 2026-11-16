/**
 * The page's scroll container (AppMain's <main>), for the views that need
 * to know where the reader is: a resume refresh must not reorder the paper
 * under a reader who is halfway down it (usePaperRefresh).
 *
 * Outside AppMain (a view rendered alone in a test) there is no container:
 * the reader counts as "at the top".
 */
import { createContext, useContext, useMemo } from 'react';

export const ScrollRootContext = createContext({ current: null });

/** Within this many px of the top counts as "at the top". */
export const AT_TOP_PX = 64;

export function useScrollRoot() {
  const ref = useContext(ScrollRootContext);
  return useMemo(
    () => ({
      atTop: () => (ref.current ? ref.current.scrollTop <= AT_TOP_PX : true),
      toTop: () => {
        if (ref.current) ref.current.scrollTop = 0;
      },
    }),
    [ref]
  );
}
