/**
 * The caller's saved library views, which one the URL is showing, and how to
 * delete one. The desktop sidebar and the phone's More sheet both list them.
 */
import { useMutation } from '@apollo/client';
import { useLocation } from 'react-router-dom';
import { DELETE_THING_FILTER } from '../graphql/mutations';
import { useThingProfile } from './useThingMeta';
import { canonicalSearch, savedViewSearch } from '../utils/libraryFilter';
import { isLibraryPath } from '../components/navConfig';

export function useSavedViews() {
  const location = useLocation();
  const { profile } = useThingProfile();
  const views = profile?.savedFilters ?? [];
  const here = isLibraryPath(location.pathname) ? canonicalSearch(location.search) : null;
  const activeView = here ? views.find((v) => canonicalSearch(savedViewSearch(v)) === here) ?? null : null;
  const [removeView] = useMutation(DELETE_THING_FILTER);
  return {
    views,
    activeView,
    hrefFor: (view) => `/${savedViewSearch(view)}`,
    remove: (view) => removeView({ variables: { id: view.id } }),
  };
}
