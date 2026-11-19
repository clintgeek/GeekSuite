/**
 * One icon per shelf — the drawer's set, also worn by the detail's Shelf
 * button (review 2026-11-18 #6: a Finished game used to wear Backlog's
 * bookmark there). Custom shelves share one icon; no shelf is a question mark.
 */
import React from 'react';
import {
  BookmarkBorder as BacklogIcon,
  CheckCircleOutline as FinishedIcon,
  CollectionsBookmarkOutlined as CustomIcon,
  DoNotDisturbAltOutlined as AbandonedIcon,
  FavoriteBorder as WishlistIcon,
  HelpOutline as UnshelvedIcon,
  PauseCircleOutline as OnHoldIcon,
  PlayCircleOutline as PlayingIcon,
} from '@mui/icons-material';

export const SHELF_ICON_COMPONENTS = {
  playing: PlayingIcon,
  backlog: BacklogIcon,
  finished: FinishedIcon,
  'on-hold': OnHoldIcon,
  abandoned: AbandonedIcon,
  wishlist: WishlistIcon,
  unshelved: UnshelvedIcon,
};

export { CustomIcon as CustomShelfIcon };

/** The icon component for a shelf id: built-in, custom, or none. */
export function shelfIconFor(shelf) {
  if (!shelf) return UnshelvedIcon;
  return SHELF_ICON_COMPONENTS[shelf] || CustomIcon;
}

export function ShelfIcon({ shelf, ...props }) {
  const Icon = shelfIconFor(shelf);
  return <Icon data-shelf-icon={shelf || 'unshelved'} {...props} />;
}
