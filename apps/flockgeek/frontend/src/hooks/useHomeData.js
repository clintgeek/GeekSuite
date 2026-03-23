import { useQuery } from '@apollo/client';
import { GET_BIRDS, GET_FLOCK_GROUPS, GET_EGG_PRODUCTIONS, GET_HATCH_EVENTS } from '../graphql/queries';
import { toLocalDateString } from '../utils/dateUtils';

const now = new Date();
const todayStr = toLocalDateString(now);
const fourteenDaysAgo = new Date(now);
fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
const rollingStartStr = toLocalDateString(fourteenDaysAgo);

export default function useHomeData() {
  const { data: birdsData, loading: birdsLoading, error: birdsError } = useQuery(GET_BIRDS);
  const { data: groupsData, loading: groupsLoading } = useQuery(GET_FLOCK_GROUPS);
  const { data: eggsData, loading: eggsLoading } = useQuery(GET_EGG_PRODUCTIONS, {
    variables: { startDate: rollingStartStr, endDate: todayStr },
  });
  const { data: hatchesData, loading: hatchesLoading } = useQuery(GET_HATCH_EVENTS);

  const loading = birdsLoading || groupsLoading || eggsLoading || hatchesLoading;
  const error = birdsError || null;

  const birdsList = birdsData?.birds || [];
  const groupsList = groupsData?.flockGroups || [];
  const eggsList = eggsData?.eggProductions || [];
  const hatchesList = hatchesData?.hatchEvents || [];

  const birdsCount = birdsList.length;
  const groupsCount = groupsList.length;
  const layingHensCount = birdsList.filter(
    b => (b.sex === 'hen' || b.sex === 'pullet') && b.status === 'active'
  ).length;

  let avgDailyEggs = 0;
  if (eggsList.length > 0) {
    const totalEggs = eggsList.reduce((sum, e) => sum + (e.eggsCount || 0), 0);
    avgDailyEggs = Math.round((totalEggs / 14) * 10) / 10;
  }

  const eggItems = eggsList.slice(0, 5).map(e => ({
    id: `egg-${ e.id }`,
    type: 'egg',
    text: `${ e.eggsCount } eggs logged`,
    occurredAt: e.date || e.createdAt,
  }));

  const hatchItems = hatchesList.slice(0, 5).map(h => ({
    id: `hatch-${ h.id }`,
    type: 'hatch',
    text: `Hatch: ${ h.notes || '' }`,
    occurredAt: h.setDate,
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
    }));

  const items = [...eggItems, ...hatchItems, ...birdItems]
    .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))
    .slice(0, 8);

  return {
    loading,
    error,
    stats: { birdsCount, groupsCount, layingHensCount, avgDailyEggs, recentHatches: hatchesList },
    items,
  };
}
