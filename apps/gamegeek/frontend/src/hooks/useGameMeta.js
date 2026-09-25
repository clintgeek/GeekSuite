/**
 * The small, app-wide reference data every screen reads: the vocabulary, the
 * caller's profile (custom shelves, owned platforms) and the shelf counts.
 * Each is its own cached query; this just names them once and derives the
 * shelf list the strip, sidebar and pickers all share.
 */
import { useMemo } from 'react';
import { useQuery } from '@apollo/client';
import { GET_GAME_PROFILE, GET_GAME_SHELVES, GET_GAME_VOCABULARY } from '../graphql/queries';
import { BUILT_IN_SHELVES, DEFAULT_VOCAB, shelfLabel } from '../utils/vocab';

export function useVocabulary() {
  const { data } = useQuery(GET_GAME_VOCABULARY, { fetchPolicy: 'cache-first' });
  return useMemo(() => {
    const v = data?.gameVocabulary;
    if (!v) return DEFAULT_VOCAB;
    const pick = (key) => (Array.isArray(v[key]) && v[key].length ? v[key] : DEFAULT_VOCAB[key]);
    return {
      shelves: pick('shelves'),
      platforms: pick('platforms'),
      storefronts: pick('storefronts'),
      copyFormats: pick('copyFormats'),
      modes: pick('modes'),
      completionLevels: pick('completionLevels'),
    };
  }, [data]);
}

export function useGameProfile() {
  const { data, loading, error } = useQuery(GET_GAME_PROFILE, { fetchPolicy: 'cache-and-network' });
  return { profile: data?.gameProfile ?? null, loading, error };
}

export function useShelfStats() {
  const { data, loading, error } = useQuery(GET_GAME_SHELVES, { fetchPolicy: 'cache-and-network' });
  return { stats: data?.gameShelves ?? null, loading, error };
}

/**
 * Built-ins in the order a player thinks about them (what I'm playing first),
 * then the caller's custom shelves.
 */
export function buildShelfList(customShelves = []) {
  return [
    ...BUILT_IN_SHELVES.map((id) => ({ id, label: shelfLabel(id), custom: false })),
    ...customShelves.map((s) => ({ id: s.id, label: s.label, custom: true })),
  ];
}

export function useShelfList() {
  const { profile } = useGameProfile();
  return useMemo(() => buildShelfList(profile?.customShelves ?? []), [profile]);
}

/** Count for one shelf id from the stats ('all' → total). Null while loading. */
export function shelfCount(stats, id) {
  if (!stats) return null;
  if (id === 'all') return stats.total ?? null;
  if (id === 'unshelved') return stats.unshelved ?? null;
  return stats.shelves?.find((s) => s.shelf === id)?.count ?? 0;
}
