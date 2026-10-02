/** Small pieces the Attic's pages share: a document row, the expiry line, the panel. */
import React from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import { ChevronRight as GoIcon } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { dustImage } from '../../theme/theme';
import { formatCalendarDate } from '../../utils/dates';
import { AtticTypeIcon, expiryPhrase } from './atticIcons';

export const atticDocPath = (id) => `/attic/doc/${encodeURIComponent(id)}`;

export const panelSx = {
  minWidth: 0,
  border: 1,
  borderColor: 'border',
  borderRadius: '3px',
  bgcolor: 'background.card',
  backgroundImage: (t) => dustImage(t.palette.mode),
  p: { xs: 1.5, md: 2 },
};

/** The tone an expiry status paints in (expired: overdue red; warning: due-soon amber). */
export function expiryColor(status) {
  if (status === 'expired') return 'status.overdue';
  if (status === 'warning') return 'status.soon';
  return 'text.secondary';
}

/** "Expires in 200 days · Mar 3, 2027" — or nothing for a document without a date. */
export function ExpiryLine({ expiry, expires, sx }) {
  if (!expiry || expiry.status === 'none' || !expires) return null;
  return (
    <Typography component="span" data-testid="expiry-line" data-status={expiry.status} sx={{ fontSize: '0.8125rem', fontWeight: expiry.status === 'ok' ? 500 : 800, color: expiryColor(expiry.status), ...sx }}>
      {expiryPhrase(expiry.label, expiry.daysUntil)} · {formatCalendarDate(expires)}
    </Typography>
  );
}

export function AtticDocRow({ doc, showPeople = true }) {
  const people = (doc.people ?? []).map((p) => p.name).join(' & ');
  const pages = doc.files?.length ?? 0;
  return (
    <Box component="li" sx={{ listStyle: 'none', borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
      <ButtonBase
        component={RouterLink}
        to={atticDocPath(doc.id)}
        data-testid="attic-doc-row"
        sx={{ width: '100%', minHeight: 56, display: 'flex', alignItems: 'center', gap: 1.5, px: 0.5, py: 1, justifyContent: 'flex-start', textAlign: 'left', '&:hover': { bgcolor: 'action.hover' } }}
      >
        <Box sx={{ width: 40, height: 40, flexShrink: 0, borderRadius: '4px', display: 'grid', placeItems: 'center', bgcolor: 'background.raised', border: 1, borderColor: 'border', color: 'text.primary' }}>
          <AtticTypeIcon name={doc.type?.icon} sx={{ fontSize: 22 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 700, fontSize: '0.9375rem', color: 'text.primary' }}>
            {doc.title}
          </Typography>
          <Typography noWrap sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
            {[doc.type?.name, showPeople ? people : null, pages ? `${pages} ${pages === 1 ? 'image' : 'images'}` : null].filter(Boolean).join(' · ')}
          </Typography>
          <ExpiryLine expiry={doc.expiry} expires={doc.expires} sx={{ display: 'block' }} />
        </Box>
        <GoIcon aria-hidden="true" sx={{ color: 'text.secondary', flexShrink: 0 }} />
      </ButtonBase>
    </Box>
  );
}

export function DocList({ docs, showPeople, empty }) {
  if (!docs.length) return <Typography sx={{ px: 0.5, py: 1, fontSize: '0.875rem', color: 'text.secondary' }}>{empty}</Typography>;
  return (
    <Box component="ul" sx={{ m: 0, p: 0 }}>
      {docs.map((d) => (
        <AtticDocRow key={d.id} doc={d} showPeople={showPeople} />
      ))}
    </Box>
  );
}

const ACTION_WORDS = {
  unlock: 'unlocked the Attic',
  'unlock-failed': 'failed to unlock',
  lock: 'locked the Attic',
  view: 'opened',
  reveal: 'revealed',
  'file-view': 'viewed an image of',
  download: 'downloaded an image of',
  upload: 'added an image to',
  'identifiers-set': 'changed',
  created: 'added',
  updated: 'edited',
  deleted: 'deleted',
  'pin-set': 'set a PIN',
  'passkey-added': 'added a fingerprint',
  'passkey-removed': 'removed a fingerprint',
};
const METHOD_WORDS = { passkey: 'with a fingerprint', pin: 'with the PIN', setup: 'while setting up' };

/** "heather revealed Passport number on Passport · Clint" — no values, ever. */
export function accessSentence(e) {
  const verb = ACTION_WORDS[e.action] ?? e.action;
  const doc = e.documentTitle || (e.documentId ? 'a deleted document' : null);
  if (e.action === 'reveal' || e.action === 'identifiers-set') return `${e.actorName} ${verb} ${e.field || 'a number'}${doc ? ` on ${doc}` : ''}`;
  if (['unlock', 'unlock-failed'].includes(e.action)) return `${e.actorName} ${verb}${METHOD_WORDS[e.method] ? ` ${METHOD_WORDS[e.method]}` : ''}`;
  if (doc) return `${e.actorName} ${verb} ${doc}`;
  return `${e.actorName} ${verb}`;
}

export function accessWhen(at, now = new Date()) {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  const mins = Math.round((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return sameDay ? `today ${time}` : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`;
}
