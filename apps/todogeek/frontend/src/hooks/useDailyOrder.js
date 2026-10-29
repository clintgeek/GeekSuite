/**
 * useDailyOrder — Today's saved manual order for one LOCAL day, and saving it
 * (DOCS/SORTING_RULES.md § "Manual order (Today)").
 *
 * `dateKey` is the page's "today" (`dayKey(pen.now)`), so a tab left open
 * overnight reads the new day's order — none, so it starts fresh by the rule —
 * as soon as PenContext moves `now` on (midnight, or the tab coming back).
 *
 * Saving is optimistic: `ids` changes at once and the list moves with it. If
 * the gateway refuses, the list goes back to what it was and a plain toast
 * says so. Only the latest save may roll back — an older one failing after a
 * newer one went through must not undo the newer one.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { useToast } from '@geeksuite/ui';
import { GET_DAILY_TASK_ORDER } from '../graphql/queries';
import { SAVE_DAILY_TASK_ORDER } from '../graphql/mutations';

export const SAVE_FAILED = "Couldn't save the new order. Try again.";
const NONE = [];

export default function useDailyOrder(dateKey) {
  const { notify } = useToast();
  const { data, loading } = useQuery(GET_DAILY_TASK_ORDER, {
    variables: { dateKey },
    skip: !dateKey,
    fetchPolicy: 'cache-and-network',
  });
  const [mutate] = useMutation(SAVE_DAILY_TASK_ORDER);
  // The optimistic list, for the day it was made on.
  const [local, setLocal] = useState(null);
  const seq = useRef(0);

  const server = data?.dailyTaskOrder ?? NONE;
  const ids = local && local.dateKey === dateKey ? local.ids : server;
  const idsRef = useRef(ids);
  idsRef.current = ids;

  // A new day drops the old day's optimistic list.
  useEffect(() => { setLocal((cur) => (cur && cur.dateKey !== dateKey ? null : cur)); }, [dateKey]);

  const save = useCallback(async (nextIds) => {
    if (!dateKey) return false;
    const mine = ++seq.current;
    const previous = idsRef.current;
    setLocal({ dateKey, ids: nextIds });
    try {
      await mutate({
        variables: { dateKey, orderedTaskIds: nextIds },
        update(cache) {
          cache.writeQuery({ query: GET_DAILY_TASK_ORDER, variables: { dateKey }, data: { dailyTaskOrder: nextIds } });
        },
      });
      return true;
    } catch {
      if (mine === seq.current) {
        setLocal({ dateKey, ids: previous });
        notify(SAVE_FAILED, { tone: 'error' });
      }
      return false;
    }
  }, [dateKey, mutate, notify]);

  return { ids, loaded: !loading || Boolean(data), save };
}
