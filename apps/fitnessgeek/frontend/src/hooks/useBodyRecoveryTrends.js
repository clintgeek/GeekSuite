import { useCallback, useEffect, useRef, useState } from 'react';
import { localDateString } from '@geeksuite/utils';
import { influxService } from '../services/influxService.js';
import { bodyCompService } from '../services/bodyCompService.js';
import { weightService } from '../services/weightService.js';
import { bpService } from '../services/bpService.js';
import { TREND_DAYS } from '../components/Reports/bodyRecoveryModel.js';
import logger from '../utils/logger.js';

/**
 * Everything the Reports "Body & recovery" section reads
 * (DOCS/FITNESSGEEK_TRENDS_PLAN.md D1–D3), one source per request.
 *
 * `Promise.allSettled`, not `all`: each source lands or fails on its own, and
 * a failure is that card's problem — a Garmin outage never blanks the weight
 * card, and a broken BP query never hides resting heart rate.
 *
 * Garmin states:
 *   'ok'            — trends arrived (`available` not false);
 *   'not_connected' — the route answered 403: this user has no Influx
 *                     connection (`settings.influxEnabled` false);
 *   'unavailable'   — the route answered, but Influx itself is down
 *                     (`available: false`);
 *   'error'         — anything else.
 *
 * `end` is the viewer's local calendar day, sent to the server (which never
 * guesses "today") and used for every window on the client.
 */
export function useBodyRecoveryTrends() {
  const [state, setState] = useState(() => ({
    loading: true,
    end: localDateString(),
    garmin: { status: 'loading', data: null },
    weight: { status: 'loading', logs: [], stats: null },
    bodyComp: { status: 'loading', summary: null },
    bp: { status: 'loading', logs: [] },
  }));
  const alive = useRef(true);

  const reload = useCallback(async () => {
    const end = localDateString();
    setState((s) => ({ ...s, loading: true, end }));
    const [trends, summary, logs, stats, bp] = await Promise.allSettled([
      influxService.getTrends({ days: TREND_DAYS, end }),
      bodyCompService.getSummary(),
      weightService.getWeightLogs(),
      weightService.getWeightStats(),
      bpService.getBPLogs(),
    ]);
    if (!alive.current) return;

    let garmin;
    if (trends.status === 'fulfilled') {
      const data = trends.value;
      if (data?.reason === 'not_enabled') {
        // The endpoint answers "not enabled" with a 200 (a 403 would make the
        // shared auth interceptor refresh the token on every Reports visit).
        garmin = { status: 'not_connected', data: null };
      } else {
        garmin = data && data.available !== false && Array.isArray(data.days)
          ? { status: 'ok', data }
          : { status: 'unavailable', data: null };
      }
    } else if (trends.reason?.response?.status === 403) {
      garmin = { status: 'not_connected', data: null };
    } else {
      logger.error('[useBodyRecoveryTrends] trends failed:', trends.reason);
      garmin = { status: 'error', data: null };
    }

    const okData = (r) => r.status === 'fulfilled' && r.value?.success && r.value.data != null;

    let weight;
    if (okData(logs) && Array.isArray(logs.value.data)) {
      weight = {
        status: 'ok',
        logs: logs.value.data,
        stats: okData(stats) ? stats.value.data : null,
      };
    } else {
      logger.error('[useBodyRecoveryTrends] weights failed:', logs.status === 'rejected' ? logs.reason : logs.value);
      weight = { status: 'error', logs: [], stats: null };
    }

    const bodyComp = okData(summary)
      ? { status: 'ok', summary: summary.value.data }
      : { status: 'error', summary: null };
    if (bodyComp.status === 'error') {
      logger.error('[useBodyRecoveryTrends] body comp failed:', summary.status === 'rejected' ? summary.reason : summary.value);
    }

    const bpState = okData(bp) && Array.isArray(bp.value.data)
      ? { status: 'ok', logs: bp.value.data }
      : { status: 'error', logs: [] };
    if (bpState.status === 'error') {
      logger.error('[useBodyRecoveryTrends] BP failed:', bp.status === 'rejected' ? bp.reason : bp.value);
    }

    setState({ loading: false, end, garmin, weight, bodyComp, bp: bpState });
  }, []);

  useEffect(() => {
    alive.current = true;
    reload();
    return () => { alive.current = false; };
  }, [reload]);

  return { ...state, reload };
}

export default useBodyRecoveryTrends;
