/**
 * What a Playnite import WOULD do (the dry run), before it does it.
 *
 * Unlike Steam, a Playnite dry run always has a definite total (the file's
 * game count) — there is no "private" state to explain, only a bad file.
 * That error lives in the card (it blocks even showing this component).
 */
import React, { useState } from 'react';
import { Box, FormControlLabel, Switch, Typography } from '@mui/material';
import { formatHours } from '../../utils/dates';
import { shelfLabel, storefrontLabel } from '../../utils/vocab';

/** Flatten a dry-run response into the numbers the card and its tests read. */
export function previewSummary(preview) {
  const counts = preview?.counts || {};
  const create = counts.create || 0;
  const addCopy = counts.addCopy || 0;
  const update = counts.update || 0;
  const unchanged = counts.unchanged || 0;
  const skippedHidden = counts.skippedHidden || 0;
  const notInFile = counts.notInFile || 0;
  const invalid = counts.invalid || 0;
  // Playing follows isInstalled (PLAYNITE_IMPORT.md §Installed → Playing):
  // per-user outcomes, outside the entry buckets.
  const movedToPlaying = counts.movedToPlaying || 0;
  const flaggedUninstalled = counts.flaggedUninstalled || 0;
  return {
    total: preview?.total ?? 0,
    create,
    addCopy,
    update,
    unchanged,
    skippedHidden,
    notInFile,
    invalid,
    movedToPlaying,
    flaggedUninstalled,
    actionable: create + addCopy + update,
    // A shelf move or a flag alone (no catalog change) is still worth committing.
    shelfChanges: movedToPlaying + flaggedUninstalled,
  };
}

function Stat({ value, label }) {
  return (
    <Box sx={{ minWidth: 0, p: 1.25, borderRadius: 2, bgcolor: 'background.raised', border: 1, borderColor: 'divider' }}>
      <Typography sx={{ fontSize: '1.375rem', fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
      <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.25 }}>{label}</Typography>
    </Box>
  );
}

function SampleList({ id, title, items, render }) {
  const [open, setOpen] = useState(false);
  if (!items?.length) return null;
  return (
    <Box sx={{ mt: 1.5 }}>
      <Box
        component="button"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        sx={{
          all: 'unset',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          minHeight: 44,
          fontSize: '0.75rem',
          fontWeight: 700,
          letterSpacing: '0.02em',
          color: 'primary.main',
        }}
      >
        {open ? 'Hide' : 'Show'} {title.toLowerCase()} ({items.length})
      </Box>
      {open ? (
        <Box component="ul" id={id} sx={{ m: 0, mt: 0.5, p: 0 }}>
          {items.map((item, i) => (
            <Box
              component="li"
              key={`${item.title}-${i}`}
              sx={{ listStyle: 'none', display: 'flex', justifyContent: 'space-between', gap: 1, py: 0.625, borderBottom: 1, borderColor: 'divider' }}
            >
              <Typography noWrap sx={{ fontSize: '0.8125rem', minWidth: 0 }}>{item.title}</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                {render(item)}
              </Typography>
            </Box>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

export default function PlaynitePreview({ preview, includeHidden, onToggleIncludeHidden, hiddenCount }) {
  if (!preview) return null;

  const s = previewSummary(preview);
  const samples = preview.samples || {};

  return (
    <Box sx={{ mt: 2 }} data-testid="playnite-preview">
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' }, gap: 1 }}>
        <Stat value={s.create} label="New games" />
        <Stat value={s.addCopy} label="Extra copies of games you already have" />
        <Stat value={s.update} label="Updated" />
        <Stat value={s.unchanged} label="Unchanged" />
      </Box>

      {hiddenCount > 0 ? (
        <FormControlLabel
          sx={{ mt: 1.5, ml: 0, width: '100%', justifyContent: 'space-between', minHeight: 44 }}
          labelPlacement="start"
          control={<Switch checked={Boolean(includeHidden)} onChange={(e) => onToggleIncludeHidden(e.target.checked)} />}
          label={<Typography sx={{ fontSize: '0.875rem' }}>Include {hiddenCount} {hiddenCount === 1 ? 'game' : 'games'} hidden in Playnite</Typography>}
        />
      ) : null}

      {s.notInFile > 0 ? (
        <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 1.5, lineHeight: 1.6 }}>
          {s.notInFile} {s.notInFile === 1 ? 'game' : 'games'} from an earlier import {s.notInFile === 1 ? "isn't" : "aren't"} in this file — {s.notInFile === 1 ? 'it' : 'they'} will stay in GameGeek.
        </Typography>
      ) : null}

      {s.movedToPlaying > 0 || s.flaggedUninstalled > 0 ? (
        <Typography data-testid="playnite-install-summary" sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 1.5, lineHeight: 1.6 }}>
          {[
            s.movedToPlaying > 0 ? `${s.movedToPlaying} installed ${s.movedToPlaying === 1 ? 'game moves' : 'games move'} to Playing` : null,
            s.flaggedUninstalled > 0
              ? `${s.flaggedUninstalled} Playing ${s.flaggedUninstalled === 1 ? 'game is' : 'games are'} not installed anymore — ${s.flaggedUninstalled === 1 ? 'it stays' : 'they stay'} on Playing and ${s.flaggedUninstalled === 1 ? 'asks' : 'ask'} how it ended`
              : null,
          ]
            .filter(Boolean)
            .join('. ')}
          .
        </Typography>
      ) : null}

      {s.invalid > 0 ? (
        <Typography sx={{ fontSize: '0.8125rem', color: 'warning.main', mt: 1, lineHeight: 1.6 }}>
          {s.invalid} {s.invalid === 1 ? 'entry' : 'entries'} in the file could not be read and {s.invalid === 1 ? 'was' : 'were'} skipped.
        </Typography>
      ) : null}

      <SampleList id="playnite-sample-create" title="New games" items={samples.create} render={(g) => storefrontLabel(g.storefront)} />
      <SampleList id="playnite-sample-addcopy" title="Extra copies" items={samples.addCopy} render={(g) => storefrontLabel(g.storefront)} />
      <SampleList
        id="playnite-sample-update"
        title="Updated"
        items={samples.update}
        render={(g) => `${formatHours(g.hoursBefore) || '0 h'} → ${formatHours(g.hoursAfter) || '0 h'}`}
      />
      <SampleList id="playnite-sample-moved" title="Moving to Playing" items={samples.movedToPlaying} render={(g) => (g.shelfBefore ? shelfLabel(g.shelfBefore) : 'Unshelved')} />
      <SampleList id="playnite-sample-flagged" title="Not installed anymore" items={samples.flaggedUninstalled} render={() => 'Playing'} />
    </Box>
  );
}
