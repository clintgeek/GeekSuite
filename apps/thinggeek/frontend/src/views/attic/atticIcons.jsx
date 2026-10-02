/** Document-type glyphs (the starter types' icon names, @geeksuite/schemas/thinggeek/attic). */
import React from 'react';
import {
  Badge,
  ChildFriendly,
  Description,
  DirectionsCar,
  Flight,
  FolderOpen,
  Gavel,
  HistoryEdu,
  Home,
  LocalHospital,
  Pets,
  Policy,
  ReceiptLong,
  Shield,
  Vaccines,
} from '@mui/icons-material';

export const ATTIC_ICONS = { Badge, ChildFriendly, Description, DirectionsCar, Flight, FolderOpen, Gavel, HistoryEdu, Home, LocalHospital, Pets, Policy, ReceiptLong, Shield, Vaccines };
export const ATTIC_ICON_NAMES = Object.keys(ATTIC_ICONS);

export function AtticTypeIcon({ name, sx, fontSize }) {
  const Icon = ATTIC_ICONS[name] ?? FolderOpen;
  return <Icon aria-hidden="true" fontSize={fontSize} sx={sx} />;
}

/** Which capture slots a type gets: cards have a front and a back; everything else is pages. */
const CARD_TYPES = new Set(['drivers-license', 'social-security', 'medical-card', 'vehicle-registration']);
export function captureSlotsFor(type) {
  if (!type) return ['page'];
  if (CARD_TYPES.has(type.key)) return ['front', 'back'];
  if (type.key === 'passport') return ['front'];
  return ['page'];
}

export const SIDE_LABELS = { front: 'Front', back: 'Back', page: 'Page' };
export function sideLabelFor(type, side) {
  if (type?.key === 'passport' && side === 'front') return 'Photo page';
  return SIDE_LABELS[side] ?? 'Page';
}

/** "Expires in 200 days" / "Expired 3 days ago" / "Renews today". */
export function expiryPhrase(label, daysUntil) {
  if (!Number.isFinite(daysUntil)) return '';
  const l = label || 'Expires';
  const verb = l;
  if (daysUntil === 0) return `${verb} today`;
  if (daysUntil < 0) return `${/renew/i.test(l) ? 'Renewal was due' : 'Expired'} ${-daysUntil} day${daysUntil === -1 ? '' : 's'} ago`;
  if (daysUntil < 60) return `${verb} in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`;
  const months = Math.round(daysUntil / 30.4);
  if (months < 24) return `${verb} in ${months} months`;
  return `${verb} in ${Math.round(daysUntil / 365)} years`;
}
