import { useEffect, useState } from 'react';
import { getProviders } from '../api/rest';

let cached = null;
let inflight = null;

/** Which metadata/import providers the server has keys for. Fetched once per load. */
export function useProviders() {
  const [providers, setProviders] = useState(cached);
  useEffect(() => {
    if (cached) return undefined;
    let live = true;
    inflight = inflight || getProviders().then((p) => {
      cached = { igdb: Boolean(p?.igdb), steamStore: Boolean(p?.steamStore) };
      return cached;
    }).catch(() => {
      inflight = null;
      return null;
    });
    inflight.then((p) => {
      if (live && p) setProviders(p);
    });
    return () => {
      live = false;
    };
  }, []);
  return providers;
}

export function resetProvidersCache() {
  cached = null;
  inflight = null;
}
