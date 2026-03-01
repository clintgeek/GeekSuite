import { useEffect, useState } from 'react';
import client from '../services/apiClient';
import { toLocalDateString } from '../utils/dateUtils';

const isDev = typeof import.meta !== 'undefined' ? Boolean(import.meta.env?.DEV) : process.env.NODE_ENV !== 'production';

function safeJson(res) {
  try {
    return res.data?.data ?? res.data;
  } catch (e) {
    return null;
  }
}

function extractList(payload, fallbackKey) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (payload?.data && Array.isArray(payload.data)) return payload.data;
  if (fallbackKey && Array.isArray(payload[fallbackKey])) return payload[fallbackKey];
  return [];
}

function extractTotal(payload, fallbackKey) {
  if (!payload) return 0;
  if (typeof payload === 'number') return payload;
  if (payload?.pagination?.total != null) return payload.pagination.total;
  if (fallbackKey && Array.isArray(payload[fallbackKey])) return payload[fallbackKey].length;
  if (Array.isArray(payload)) return payload.length;
  return 0;
}

export default function useHomeData() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({});
  const [items, setItems] = useState([]);

  useEffect(() => {
    let mounted = true;

    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        // Parallel requests
        const now = new Date();
        const todayStr = toLocalDateString(now);

        // Rolling 14-day window for egg average
        const fourteenDaysAgo = new Date(now);
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
        const rollingStartStr = toLocalDateString(fourteenDaysAgo);

        const reqs = await Promise.allSettled([
          client.get('/birds'),
          client.get('/groups'),
          client.get(`/egg-production?startDate=${ rollingStartStr }&endDate=${ todayStr }`),
          client.get('/hatch-events?limit=5')
        ]);

        const [birdsRes, groupsRes, eggsRes, hatchesRes] = reqs.map(r => (r.status === 'fulfilled' ? r.value : null));

        const birds = birdsRes ? await safeJson(birdsRes) : [];
        const groups = groupsRes ? await safeJson(groupsRes) : [];
        const eggs = eggsRes ? await safeJson(eggsRes) : [];
        const hatches = hatchesRes ? await safeJson(hatchesRes) : [];

        // Normalize arrays if needed
        const birdsList = extractList(birds, 'birds');
        const groupsList = extractList(groups, 'groups');
        const eggsList = extractList(eggs, 'eggProduction');
        const hatchesList = extractList(hatches, 'hatchEvents');

        // Build stats
        const birdsCount = extractTotal(birds, 'birds') || birdsList.length;
        const groupsCount = extractTotal(groups, 'groups') || groupsList.length;
        const layingHensCount = birdsList.filter(b => (b.sex === 'hen' || b.sex === 'pullet') && b.status === 'active').length;

        // Rolling 14-day average: total eggs collected in the window ÷ 14 days
        let avgDailyEggs = 0;
        if (eggsList.length > 0) {
          let totalEggs = 0;
          for (const e of eggsList) {
            totalEggs += (e.eggsCount || 0);
          }
          avgDailyEggs = Math.round((totalEggs / 14) * 10) / 10;
        }

        if (isDev) {
          const debugPayload = {
            birdsCount,
            groupsCount,
            eggsEntries: eggsList.length,
            hatchesEntries: hatchesList.length,
            rawBirdsType: typeof birds,
            birdsKeys: birds && typeof birds === 'object' ? Object.keys(birds) : null,
            timestamp: new Date().toISOString()
          };
          console.info('[useHomeData] stats computed', debugPayload);
          if (typeof window !== 'undefined') {
            window.__FG_HOME_DEBUG__ = {
              ...debugPayload,
              birdsListLength: birdsList.length,
              groupsListLength: groupsList.length,
              eggsRaw: eggs,
              birdsRaw: birds
            };
          }
        }

        // Recent activity: map eggs and hatches and birds (recently created)
        const eggItems = eggsList.slice(0, 5).map(e => ({
          id: `egg-${ e._id || e.id || Math.random() }`,
          type: 'egg',
          text: `${ e.eggsCount } eggs logged${ e.groupId ? ` for group ${ e.groupId }` : e.birdId ? ` for bird ${ e.birdId }` : '' }`,
          occurredAt: e.date || e.createdAt || e.occurredAt
        }));

        const hatchItems = hatchesList.slice(0, 5).map(h => ({
          id: `hatch-${ h._id || h.id || Math.random() }`,
          type: 'hatch',
          text: `Hatch: ${ h.title || h.description || '' }`,
          occurredAt: h.occurredAt || h.date || h.createdAt
        }));

        const birdItems = birdsList
          .filter(b => b.createdAt)
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, 3)
          .map(b => ({ id: `bird-${ b._id || b.id }`, type: 'bird', text: `New bird: ${ b.name || b.tagId || 'unnamed' }`, occurredAt: b.createdAt }));

        const merged = [...eggItems, ...hatchItems, ...birdItems].sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt)).slice(0, 8);

        if (!mounted) return;

        setStats({ birdsCount, groupsCount, layingHensCount, avgDailyEggs, recentHatches: hatchesList });
        setItems(merged);
      } catch (err) {
        if (!mounted) return;
        setError(err);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    fetchData();

    return () => { mounted = false; };
  }, []);

  return { loading, error, stats, items };
}
