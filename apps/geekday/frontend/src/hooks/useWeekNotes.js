/**
 * The pictures on the week spread: each day's ink page, found the way the day
 * page finds it (the exact day tag) and reduced to a few polylines.
 *
 * Read only once the tasks are on screen (`enabled`), so the week is usable
 * before seven sketches have come down. A day whose read fails, or whose page
 * cannot be parsed, simply has no picture: a missing thumbnail is not worth an
 * error on a page that is otherwise whole.
 */
import { useEffect, useState } from 'react';
import { useApolloClient } from '@apollo/client';
import { FIND_WEEK_DAY_NOTE } from '../graphql/documents.js';
import { inkThumbFor } from '../components/week/inkThumb.js';
import { dayTagFor } from '../lib/days.js';
import { pickDayNote } from '../store/dayNoteStore.js';

const READ_TIMEOUT_MS = 20000;

/**
 * @param {string[]} keys  the seven day keys
 * @param {boolean} enabled
 * @returns {Record<string, { paths: string[], top: number }>} a picture per day that has one
 */
export function useWeekNotes(keys, enabled) {
  const client = useApolloClient();
  const [thumbs, setThumbs] = useState({});
  const week = keys.join(',');

  useEffect(() => {
    setThumbs({});
    if (!enabled) return undefined;
    let cancelled = false;
    week.split(',').forEach(async (key) => {
      try {
        const { data } = await client.query({
          query: FIND_WEEK_DAY_NOTE,
          variables: { tag: dayTagFor(key) },
          fetchPolicy: 'no-cache',
          context: { timeoutMs: READ_TIMEOUT_MS },
        });
        // Parsed here, once per answer, not while rendering; only the polylines are kept.
        const thumb = inkThumbFor(pickDayNote(data?.notes)?.content);
        if (!cancelled && thumb) setThumbs((all) => ({ ...all, [key]: thumb }));
      } catch {
        // No picture for this day.
      }
    });
    return () => {
      cancelled = true;
    };
  }, [client, week, enabled]);

  return thumbs;
}
