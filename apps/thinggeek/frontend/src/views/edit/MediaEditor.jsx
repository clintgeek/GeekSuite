/**
 * Photos and documents already on a thing: change a role, a caption or a
 * title, reorder (the first photo is the cover), or remove. Removing only
 * drops the reference from this thing — the file itself is purged later by
 * the backend — so the words are "removed", with an Undo until you save,
 * never "deleted forever".
 */
import React from 'react';
import { Box, Button, IconButton, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import { ArrowDownward as DownIcon, ArrowUpward as UpIcon, DeleteOutline as RemoveIcon, DescriptionOutlined as DocIcon } from '@mui/icons-material';
import ThingPhoto from '../../components/ThingPhoto';
import { documentRoleLabel, photoRoleLabel } from '../../utils/vocab';

export function move(list, index, delta) {
  const next = [...list];
  const to = index + delta;
  if (to < 0 || to >= next.length) return list;
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

export default function MediaEditor({ kind = 'photo', rows, onChange, roles }) {
  const isPhoto = kind === 'photo';
  const noun = isPhoto ? 'photo' : 'document';
  const labelFor = isPhoto ? photoRoleLabel : documentRoleLabel;
  const set = (id, patch) => onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const kept = rows.filter((r) => !r.removed);

  if (!rows.length) {
    return (
      <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
        {isPhoto ? 'No photos yet — add them from the thing’s page (the camera opens right there).' : 'No documents yet — add them from the thing’s page.'}
      </Typography>
    );
  }

  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
      {rows.map((r) => {
        const position = kept.findIndex((k) => k.id === r.id);
        const name = isPhoto ? r.caption || `${labelFor(r.role)} photo` : r.title || r.originalName || labelFor(r.role);
        if (r.removed) {
          return (
            <Box component="li" key={r.id} data-testid={`${noun}-removed`} sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 52, px: 1.5, borderRadius: 2, border: 1, borderStyle: 'dashed', borderColor: 'border' }}>
              <Typography sx={{ flex: 1, minWidth: 0, fontSize: '0.875rem', color: 'text.secondary' }} noWrap>
                Removed: {name}
              </Typography>
              <Button size="small" onClick={() => set(r.id, { removed: false })} sx={{ color: 'text.primary' }}>
                Undo
              </Button>
            </Box>
          );
        }
        return (
          <Box
            component="li"
            key={r.id}
            data-testid={`${noun}-editor-row`}
            sx={{ display: 'grid', gridTemplateColumns: { xs: '56px minmax(0, 1fr)', sm: '56px 150px minmax(0, 1fr) auto' }, gap: 1, alignItems: 'center', p: 1, borderRadius: 2, border: 1, borderColor: 'divider' }}
          >
            {isPhoto ? (
              <ThingPhoto src={r.thumbUrl || r.url} variant="thumb" radius={6} />
            ) : (
              <Box sx={{ width: 56, height: 56, display: 'grid', placeItems: 'center', borderRadius: '6px', bgcolor: 'background.raised', color: 'text.secondary' }}>
                <DocIcon />
              </Box>
            )}
            <TextField select size="small" label="Role" value={r.role} onChange={(e) => set(r.id, { role: e.target.value })}>
              {roles.map((role) => (
                <MenuItem key={role} value={role}>
                  {labelFor(role)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              label={isPhoto ? 'Caption' : 'Title'}
              value={(isPhoto ? r.caption : r.title) ?? ''}
              onChange={(e) => set(r.id, isPhoto ? { caption: e.target.value } : { title: e.target.value })}
              inputProps={{ maxLength: 200 }}
              sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }}
            />
            <Box sx={{ display: 'flex', gap: 0.25, justifyContent: 'flex-end', gridColumn: { xs: '1 / -1', sm: 'auto' } }}>
              <Tooltip title="Move up">
                <span>
                  <IconButton aria-label={`Move ${name} up`} disabled={position <= 0} onClick={() => onChange(move(rows, rows.indexOf(r), -1))} sx={{ color: 'text.secondary' }}>
                    <UpIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Move down">
                <span>
                  <IconButton aria-label={`Move ${name} down`} disabled={position === kept.length - 1} onClick={() => onChange(move(rows, rows.indexOf(r), 1))} sx={{ color: 'text.secondary' }}>
                    <DownIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title={`Remove this ${noun}`}>
                <IconButton aria-label={`Remove ${name}`} onClick={() => set(r.id, { removed: true })} sx={{ color: 'text.secondary' }}>
                  <RemoveIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        );
      })}
      {isPhoto && kept.length > 1 ? (
        <Typography component="li" sx={{ listStyle: 'none', fontSize: '0.75rem', color: 'text.secondary' }}>
          The gallery shows them in this order; the first overview photo is the cover.
        </Typography>
      ) : null}
    </Box>
  );
}
