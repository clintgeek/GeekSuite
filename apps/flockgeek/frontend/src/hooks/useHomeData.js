import { useQuery } from '@apollo/client';
import { GET_BIRDS, GET_FLOCK_GROUPS, GET_EGG_PRODUCTIONS, GET_HATCH_EVENTS } from '../graphql/queries';

import { localDateString, utcDateString } from '@geeksuite/utils';

/**
 * The rolling 14-day window ending today, as two `YYYY-MM-DD` calendar days.
 *
 * Going-over 2026-09-05: these three constants used to be evaluated once, at
 * module load. HomePage is the eager index route, so "today" was frozen at
 * page load — a tab left open overnight (a kitchen tablet, a wall dashboard,
 * a browser that never gets closed) kept asking for yesterday's window, so
 * this morning's harvest never appeared and the 14-day average silently
 * lagged a day. Computed per render now: the strings are stable within a day,
 * so Apollo sees the same variables and does not refetch, and they change
 * exactly once — when the local day does.
 */
export function rollingWindow() {
  const now = new Date();
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  return { todayStr: localDateString(now), rollingStartStr: localDateString(fourteenDaysAgo) };
}

export default function useHomeData() {
  const { todayStr, rollingStartStr } = rollingWindow();
  const birds = useQuery(GET_BIRDS);
  const groups = useQuery(GET_FLOCK_GROUPS);
  const eggs = useQuery(GET_EGG_PRODUCTIONS, {
    variables: { startDate: rollingStartStr, endDate: todayStr },
  });
  const hatches = useQuery(GET_HATCH_EVENTS);
  const queries = [birds, groups, eggs, hatches];
  const { data: birdsData } = birds;
  const { data: groupsData } = groups;
  const { data: eggsData } = eggs;
  const { data: hatchesData } = hatches;

  const loading = queries.some((q) => q.loading);
  // SUITE_REVIEW_2026-11 (FlockGeek 2): only the birds error used to count,
  // so a failed egg read became "0 eggs a day" — the reassuring-wrong
  // direction. Every card on Home is computed from one of these four reads,
  // so ANY of them failing with nothing to show is a failed Home; a failed
  // background refetch that left earlier data in place is not.
  const error = queries.find((q) => q.error && !q.data)?.error || null;
  const refetch = () => Promise.all(queries.map((q) => q.refetch()));

  const birdsList = birdsData?.birds || [];
  const groupsList = groupsData?.flockGroups || [];
  const eggsList = eggsData?.eggProductions || [];
  const hatchesList = hatchesData?.hatchEvents || [];

  const birdsCount = birdsList.filter(b => b.status === 'active').length;
  const groupsCount = groupsList.length;
  const layingHensCount = birdsList.filter(
    b => (b.sex === 'hen' || b.sex === 'pullet') && b.status === 'active'
  ).length;

  let avgDailyEggs = 0;
  if (eggsList.length > 0) {
    const totalEggs = eggsList.reduce((sum, e) => sum + (e.eggsCount || 0), 0);
    avgDailyEggs = Math.round((totalEggs / 14) * 10) / 10;
  }

  // Today's harvest, for Home's "Today" line (UX review 2026-11-18, FlockGeek
  // 2): the question a keeper opens the app with is "did someone already
  // collect today?". A harvest date is a calendar day stored at UTC midnight,
  // so it is compared as a UTC day against the local "today".
  const todayRecords = eggsList.filter((e) => utcDateString(e.date) === todayStr);
  const today = {
    logged: todayRecords.length > 0,
    eggs: todayRecords.reduce((sum, e) => sum + (e.eggsCount || 0), 0),
    locationIds: [...new Set(todayRecords.map((e) => e.locationId).filter(Boolean))],
  };

  // `calendarDay` tells RecentActivity which of the two kinds of date this
  // row carries: a harvest date and a set date are calendar days stored at UTC
  // midnight, a bird's `createdAt` is a real instant. Rendering the first two
  // as "19h ago" was both meaningless and a day out west of UTC.
  const eggItems = eggsList.slice(0, 5).map(e => ({
    id: `egg-${ e.id }`,
    type: 'egg',
    text: `${ e.eggsCount } eggs logged`,
    occurredAt: e.date || e.createdAt,
    calendarDay: !!e.date,
  }));

  const hatchItems = hatchesList.slice(0, 5).map(h => ({
    id: `hatch-${ h.id }`,
    type: 'hatch',
    text: `Hatch: ${ h.notes || '' }`,
    occurredAt: h.setDate,
    calendarDay: true,
  }));

  const birdItems = birdsList
    .filter(b => b.createdAt)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 3)
    .map(b => ({
      id: `bird-${ b.id }`,
      type: 'bird',
      text: `New bird: ${ b.name || b.tagId || 'unnamed' }`,
      occurredAt: b.createdAt,
      calendarDay: false,
    }));

  const items = [...eggItems, ...hatchItems, ...birdItems]
    .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))
    .slice(0, 8);

  return {
    loading,
    error,
    refetch,
    stats: { birdsCount, groupsCount, layingHensCount, avgDailyEggs, recentHatches: hatchesList },
    today,
    items,
  };
}
