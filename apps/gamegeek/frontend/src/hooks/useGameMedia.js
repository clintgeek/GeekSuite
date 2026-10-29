/**
 * A game's screenshots, trailers and provider page links, fetched when the
 * detail page opens (DOCS/METADATA_ENRICHMENT.md §Media and links). Never
 * blocks the page: the sheet draws at once and this fills in.
 *
 * `status`: 'loading' | 'ready' | 'error'. A partial answer (one provider
 * failed) is 'ready' with what arrived; 'error' means nothing arrived and
 * something failed.
 */
import { useEffect, useState } from 'react';
import { getGameMedia } from '../api/rest';

const EMPTY = { links: [], screenshots: [], videos: [] };

export function useGameMedia(gameId) {
  const [state, setState] = useState({ status: 'loading', media: EMPTY });

  useEffect(() => {
    if (!gameId) return undefined;
    const controller = new AbortController();
    setState({ status: 'loading', media: EMPTY });
    getGameMedia(gameId, { signal: controller.signal })
      .then((res) => {
        if (controller.signal.aborted) return;
        const media = {
          links: Array.isArray(res?.links) ? res.links : [],
          screenshots: Array.isArray(res?.screenshots) ? res.screenshots : [],
          videos: Array.isArray(res?.videos) ? res.videos : [],
        };
        const nothing = !media.screenshots.length && !media.videos.length;
        const failed = Array.isArray(res?.errors) && res.errors.length > 0;
        setState({ status: nothing && failed ? 'error' : 'ready', media });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error', media: EMPTY });
      });
    return () => controller.abort();
  }, [gameId]);

  return state;
}

export default useGameMedia;
