import { useEffect, useState } from 'react';
import { apiService } from '../../services/apiService';

/**
 * Does this person have a Garmin watch connected? ONE answer, so the Trends
 * tabs, the Food view's body section and the quiet "Have a Garmin watch?"
 * line cannot disagree.
 *
 * Read from the settings the app already loads: a saved Garmin login
 * (`garmin.enabled`) or the watch-data switch (`influxEnabled`). Either one
 * means "this person owns a watch".
 */
export const watchConnectedFrom = (settings) => !!(settings?.garmin?.enabled || settings?.influxEnabled);

/** Where a person without a watch is sent to connect one. */
export const CONNECT_WATCH_HREF = '/settings#devices';

// The last answer, kept on this device so a returning person's Trends opens
// with the right shape straight away (tabs or no tabs) instead of growing or
// losing a tab bar a moment later. A hint only: the settings read decides.
const HINT_KEY = 'fitnessgeek.watchConnected';
const readHint = () => {
  try {
    const raw = window.localStorage.getItem(HINT_KEY);
    return raw === '1' ? 'connected' : raw === '0' ? 'none' : null;
  } catch {
    return null;
  }
};
const writeHint = (connected) => {
  try {
    window.localStorage.setItem(HINT_KEY, connected ? '1' : '0');
  } catch {
    /* private mode, storage full: the hint is only a nicety */
  }
};

/**
 * status:
 *   'checking'   not known yet (first visit on this device, still reading)
 *   'connected'  a watch is connected
 *   'none'       no watch
 *   'unknown'    the settings read FAILED. Treated as connected everywhere:
 *                a failed read must never hide a watch owner's data.
 *
 * `showWatch` is the one flag callers branch on: true for connected and
 * unknown. `settled` is false while the answer is still only the device's
 * remembered hint (or nothing).
 */
export function useWatchConnection() {
  const [state, setState] = useState(() => ({ status: readHint() || 'checking', settled: false }));

  useEffect(() => {
    let alive = true;
    apiService.get('/user/settings')
      .then((response) => {
        if (!alive) return;
        const settings = response && typeof response === 'object' && 'data' in response ? response.data : response;
        // An answer with no settings in it is not a "no": it is unknown.
        if (!settings || typeof settings !== 'object') {
          setState({ status: 'unknown', settled: true });
          return;
        }
        const connected = watchConnectedFrom(settings);
        writeHint(connected);
        setState({ status: connected ? 'connected' : 'none', settled: true });
      })
      .catch(() => {
        if (alive) setState({ status: 'unknown', settled: true });
      });
    return () => { alive = false; };
  }, []);

  return {
    ...state,
    showWatch: state.status === 'connected' || state.status === 'unknown',
  };
}

export default useWatchConnection;
