/**
 * useSignalBox — every reading the dashboard shows, polled, in one place.
 *
 * Everyone:
 *   - the app registry (`/apps`) for the line's stations, in KEY_APPS order,
 *     falling back to a fixed list when the registry is unreachable;
 *   - each station's health through baseGeek's proxy (`/health/app/<name>`).
 *
 * The depot (infrastructure) reads differently by role, because the detailed
 * status routes are admin-only on the server: an admin gets the four
 * `/<service>/status` routes (with versions, and Postgres); anyone else gets
 * the public `/health/infra` probe (Mongo, Redis, Influx). Before this, a
 * non-admin's Home called the admin routes, took four 403s and drew the whole
 * depot "offline" — a false fault on the one screen they can see.
 *
 * Admin only, on top:
 *   - `GET /ai/status` — spend, catalog, providers, the attention list;
 *   - `aiTraffic` (GraphQL) — calls per day from the ledger;
 *   - `POST /ai/catalog/run` — lever 2.
 *
 * The register (train register book) is a session log of what the box has
 * *observed*: lamp changes between two measured readings, and levers thrown.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gql } from '@apollo/client';
import api from '../api';
import { apolloClient } from '../apolloClient';
import { healthLamp, lampTransitions } from './readings';

export const KEY_APPS = ['fitnessgeek', 'bujogeek', 'notegeek', 'bookgeek', 'flockgeek', 'startgeek'];

export const FALLBACK_APPS = [
  { name: 'fitnessgeek', displayName: 'fitnessGeek', description: 'Nutrition & fitness', icon: 'FitnessCenter', color: '#7dac8e', url: 'https://fitnessgeek.clintgeek.com', tag: 'health' },
  { name: 'bujogeek', displayName: 'bujoGeek', description: 'Bullet journal & tasks', icon: 'Book', color: '#d4956a', url: 'https://bujogeek.clintgeek.com', tag: 'productivity' },
  { name: 'notegeek', displayName: 'noteGeek', description: 'Notes & documents', icon: 'Note', color: '#a99df0', url: 'https://notegeek.clintgeek.com', tag: 'productivity' },
  { name: 'bookgeek', displayName: 'bookGeek', description: 'Library & reading', icon: 'MenuBook', color: '#5fa8d3', url: 'https://bookgeek.clintgeek.com', tag: 'reading' },
  { name: 'flockgeek', displayName: 'flockGeek', description: 'Flock management', icon: 'NatureOutlined', color: '#9a8f6a', url: 'https://flockgeek.clintgeek.com', tag: 'management' },
  { name: 'startgeek', displayName: 'startGeek', description: 'Start page & launcher', icon: 'RocketLaunch', color: '#e6b35a', url: 'https://start.clintgeek.com', tag: 'launcher' },
];

/** The key apps in order, preferring registry data over the fallback entry. */
export function pickKeyApps(registry) {
  const byName = new Map((registry || []).map((app) => [String(app.name).toLowerCase(), app]));
  return KEY_APPS.map((name) => byName.get(name) || FALLBACK_APPS.find((app) => app.name === name)).filter(Boolean);
}

/** The admin depot: detailed status routes, each with its own version field. */
export const ADMIN_SERVICES = [
  { name: 'MongoDB', endpoint: '/mongo/status', key: 'mongo', version: (d) => d?.serverInfo?.version },
  { name: 'PostgreSQL', endpoint: '/postgres/status', key: 'postgres', version: (d) => d?.version?.match(/PostgreSQL (\d+(?:\.\d+)?)/)?.[1] },
  { name: 'Redis', endpoint: '/redis/status', key: 'redis', version: (d) => d?.redisVersion },
  { name: 'InfluxDB', endpoint: '/influx/status', key: 'influx', version: (d) => d?.version },
];

/** The public depot: what `/health/infra` probes. */
export const PUBLIC_SERVICES = [
  { name: 'MongoDB', key: 'mongo' },
  { name: 'Redis', key: 'redis' },
  { name: 'InfluxDB', key: 'influx' },
];

export const AI_TRAFFIC = gql`
  query GetAITraffic($days: Int) {
    aiTraffic(days: $days) {
      today
      days { day calls costUsd refusals }
      apps { app calls costUsd }
    }
  }
`;

const REGISTER_LIMIT = 40;

function stamp(date = new Date()) {
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function useSignalBox({ isAdmin }) {
  const [apps, setApps] = useState(() => pickKeyApps([]));
  const [appHealth, setAppHealth] = useState({});
  const [serviceStatus, setServiceStatus] = useState({});
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState(null);
  const [traffic, setTraffic] = useState(null);
  const [trafficError, setTrafficError] = useState(null);
  const [register, setRegister] = useState(() => [{ at: stamp(), text: 'Box opened — reading the instruments' }]);
  const lastLamps = useRef({});

  const log = useCallback((text) => {
    setRegister((prev) => [{ at: stamp(), text }, ...prev].slice(0, REGISTER_LIMIT));
  }, []);

  const services = isAdmin ? ADMIN_SERVICES : PUBLIC_SERVICES;

  const readRegistry = useCallback(async () => {
    try {
      const res = await api.get('/apps');
      if (res.data?.apps?.length > 0) setApps(pickKeyApps(res.data.apps));
    } catch {
      // Keep the fallback line.
    }
  }, []);

  const readServices = useCallback(async () => {
    const results = {};
    if (isAdmin) {
      for (const svc of ADMIN_SERVICES) {
        try {
          const start = Date.now();
          const res = await api.get(svc.endpoint);
          results[svc.key] = { online: true, latency: Date.now() - start, version: svc.version?.(res.data) || null };
        } catch {
          results[svc.key] = { online: false, latency: null, version: null };
        }
      }
    } else {
      try {
        const res = await api.get('/health/infra');
        const probed = res.data?.services || {};
        for (const svc of PUBLIC_SERVICES) {
          const row = probed[svc.key];
          results[svc.key] = row
            ? { online: row.online === true, latency: row.latency ?? null, version: row.version || null }
            : { online: false, latency: null, version: null };
        }
      } catch {
        for (const svc of PUBLIC_SERVICES) results[svc.key] = { online: false, latency: null, version: null };
      }
    }
    setServiceStatus(results);
  }, [isAdmin]);

  const readAppHealth = useCallback(async (list) => {
    const results = {};
    for (const app of list) {
      const key = app.name.toLowerCase();
      try {
        const res = await api.get(`/health/app/${key}`);
        results[app.name] = {
          online: res.data.status === 'online',
          latency: res.data.latency,
          version: res.data.data?.version || null,
          checkedAt: res.data.checkedAt,
        };
      } catch {
        results[app.name] = { online: false, latency: null, version: null, checkedAt: new Date().toISOString() };
      }
    }
    setAppHealth(results);
  }, []);

  const readStatus = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await api.get('/ai/status');
      setStatus(res.data);
      setStatusError(null);
    } catch (err) {
      setStatusError(err.response?.data?.error?.message || err.message || 'status unavailable');
    }
  }, [isAdmin]);

  const readTraffic = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const { data } = await apolloClient.query({ query: AI_TRAFFIC, variables: { days: 7 }, fetchPolicy: 'network-only' });
      setTraffic(data?.aiTraffic || null);
      setTrafficError(null);
    } catch (err) {
      setTrafficError(err.message || 'ledger unavailable');
    }
  }, [isAdmin]);

  useEffect(() => { readRegistry(); }, [readRegistry]);

  useEffect(() => {
    readServices();
    const t = setInterval(readServices, 30000);
    return () => clearInterval(t);
  }, [readServices]);

  useEffect(() => {
    if (!apps.length) return undefined;
    readAppHealth(apps);
    const t = setInterval(() => readAppHealth(apps), 60000);
    return () => clearInterval(t);
  }, [apps, readAppHealth]);

  useEffect(() => {
    if (!isAdmin) return undefined;
    readStatus();
    readTraffic();
    const s = setInterval(readStatus, 60000);
    const t = setInterval(readTraffic, 120000);
    return () => {
      clearInterval(s);
      clearInterval(t);
    };
  }, [isAdmin, readStatus, readTraffic]);

  // The register: log a lamp only when it changes between measured states.
  const lamps = useMemo(() => {
    const out = {};
    for (const app of apps) out[app.displayName] = healthLamp(appHealth[app.name]);
    for (const svc of services) out[svc.name] = healthLamp(serviceStatus[svc.key]);
    return out;
  }, [apps, appHealth, services, serviceStatus]);

  useEffect(() => {
    const changes = lampTransitions(lastLamps.current, lamps);
    for (const change of changes) log(`${change.key}: ${change.from} → ${change.to}`);
    // Keep measured states only, so "checking" never becomes a baseline.
    const next = { ...lastLamps.current };
    for (const [key, state] of Object.entries(lamps)) if (state !== 'unknown') next[key] = state;
    lastLamps.current = next;
  }, [lamps, log]);

  const rereadAll = useCallback(async () => {
    log('Lever 1 — re-reading every instrument');
    await Promise.all([readServices(), readAppHealth(apps), readStatus(), readTraffic()]);
    log('Instruments re-read');
  }, [apps, log, readAppHealth, readServices, readStatus, readTraffic]);

  /**
   * Lever 2. `202 { started: true }` or `409 { reason: 'running' }` — either
   * way the job runs out of band, and the next status read reports it.
   */
  const runDiscovery = useCallback(async () => {
    try {
      await api.post('/ai/catalog/run');
      log('Lever 2 — catalog discovery started');
      await readStatus();
      return { ok: true, message: 'Catalog discovery started. It runs in the background; the catalog gauge updates when it finishes.' };
    } catch (err) {
      if (err.response?.status === 409) {
        log('Lever 2 — refused: a discovery is already running');
        return { ok: true, message: 'A catalog discovery is already running.' };
      }
      log('Lever 2 — failed to start discovery');
      return { ok: false, message: err.response?.data?.error?.message || 'Could not start catalog discovery.' };
    }
  }, [log, readStatus]);

  // Held over for exactly as long as the server says the job is running.
  const running = status?.catalog?.running === true;

  return {
    apps,
    appHealth,
    services,
    serviceStatus,
    status,
    statusError,
    traffic,
    trafficError,
    discoveryRunning: running,
    register,
    log,
    rereadAll,
    runDiscovery,
  };
}
