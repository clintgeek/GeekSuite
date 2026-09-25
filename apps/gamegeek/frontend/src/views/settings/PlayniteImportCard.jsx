/**
 * Playnite: the primary way the library is fed. Pick an export, a dry run
 * runs automatically, then commit. Steam (below, demoted) stays around for
 * metadata later — this is where the games actually come from.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import { UploadFile as UploadIcon } from '@mui/icons-material';
import { useApolloClient } from '@apollo/client';
import { useToast } from '@geeksuite/ui';
import { importPlaynite, getPlayniteDropStatus } from '../../api/rest';
import { formatCalendarDate, relativeDay } from '../../utils/dates';
import { visuallyHidden } from '../../utils/a11y';
import SettingsCard from './SettingsCard';
import PlaynitePreview, { previewSummary } from './PlaynitePreview';
import { resetLibraryLists } from '../../graphql/cachePolicies';

function fileSizeLabel(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function errorMessage(err) {
  if (err?.body?.error?.code === 'PLAYNITE_BAD_FILE') {
    return "That file isn't a Playnite Library Exporter export (schema v1).";
  }
  return err?.message || 'The Playnite import failed.';
}

/**
 * The Nextcloud auto-import line under the manual upload
 * (apps/gamegeek/DOCS/PLAYNITE_IMPORT.md, folder import). The upload above is
 * the fallback either way, so this is informational only — never a control.
 */
export function dropStatusMessage(status) {
  if (!status?.enabled) return null;
  const { watching, folder, lastFile } = status;
  if (!watching) return `Auto-import: waiting for a ${folder} folder in Nextcloud.`;

  const base = `Auto-import: watching ${folder} in Nextcloud`;
  if (!lastFile) return `${base} — no export received yet.`;

  const when = relativeDay(lastFile.processedAt);
  if (lastFile.status === 'imported') {
    const c = lastFile.counts || {};
    const parts = [];
    if (c.create) parts.push(`${c.create} new`);
    if (c.update) parts.push(`${c.update} updated`);
    const detail = parts.length ? ` (${parts.join(', ')})` : ' (no changes)';
    return `${base} — last export imported ${when}${detail}`;
  }
  if (lastFile.status === 'skipped-older') return `${base} — the last export was older than what's already imported, so it was skipped.`;
  if (lastFile.status === 'skipped-duplicate') return `${base} — last export ${when} matched what's already imported.`;
  return `${base} — the last export failed: ${lastFile.error || 'unknown error'}`;
}

export default function PlayniteImportCard({ profile }) {
  const client = useApolloClient();
  const { notify } = useToast();
  const inputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [includeHidden, setIncludeHidden] = useState(false);
  const [hiddenCount, setHiddenCount] = useState(null);
  const [busy, setBusy] = useState(null); // 'dryRun' | 'commit' | null
  const [error, setError] = useState(null);
  const [dropStatus, setDropStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getPlayniteDropStatus()
      .then((s) => { if (!cancelled) setDropStatus(s); })
      .catch(() => { if (!cancelled) setDropStatus(null); });
    return () => { cancelled = true; };
  }, []);

  const runDryRun = async (f, hidden) => {
    setBusy('dryRun');
    setError(null);
    try {
      const result = await importPlaynite(f, { dryRun: true, includeHidden: hidden });
      setPreview(result);
      if (!hidden) setHiddenCount(result?.counts?.skippedHidden ?? 0);
    } catch (err) {
      setPreview(null);
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(null);
    setError(null);
    setHiddenCount(null);
    setIncludeHidden(false);
    runDryRun(f, false);
  };

  const handleToggleIncludeHidden = (checked) => {
    setIncludeHidden(checked);
    if (file) runDryRun(file, checked);
  };

  const handleCommit = async () => {
    if (!file) return;
    setBusy('commit');
    try {
      const result = await importPlaynite(file, { dryRun: false, includeHidden });
      const s = previewSummary(result);
      const parts = [];
      if (s.create) parts.push(`${s.create} new`);
      if (s.addCopy) parts.push(`${s.addCopy} extra ${s.addCopy === 1 ? 'copy' : 'copies'}`);
      if (s.update) parts.push(`${s.update} updated`);
      notify(`Playnite import done — ${parts.join(', ') || 'nothing changed'}.`, { tone: 'success' });
      setFile(null);
      setPreview(null);
      setIncludeHidden(false);
      setHiddenCount(null);
      if (inputRef.current) inputRef.current.value = '';
      // A bulk change: drop the cached lists (they reload fresh) and refresh the rest.
      resetLibraryLists(client);
      await client.refetchQueries({ include: ['GetGameShelves', 'GetGameProfile'] });
    } catch (err) {
      notify(errorMessage(err), { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const s = previewSummary(preview);
  const canCommit = preview && !error && s.actionable > 0;

  return (
    <SettingsCard
      id="playnite"
      title="Import from Playnite"
      description="Export your library from Playnite with Playnite Library Exporter, then pick the .json here. Re-import any time — it updates, never deletes."
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        {/*
          The input is a SIBLING of the label, connected by htmlFor/id — not a
          descendant. Nesting a focusable <input> inside a MUI Button (which
          adds its own tabIndex/role to the wrapping <label>) trips axe's
          nested-interactive check, because a negative tabindex on the input
          does not stop assistive tech from reaching it via other navigation.
          A sibling label+input is the plain, standards-accessible shape.
        */}
        <Button component="label" htmlFor="playnite-file-input" variant="outlined" startIcon={<UploadIcon />} sx={{ minHeight: 44, flexShrink: 0, color: 'text.primary' }}>
          {file ? 'Choose a different file' : 'Choose your export'}
        </Button>
        <Box
          component="input"
          id="playnite-file-input"
          type="file"
          accept="application/json,.json"
          data-testid="playnite-file-input"
          ref={inputRef}
          onChange={handleFileChange}
          sx={visuallyHidden}
        />
        {file ? (
          <Typography noWrap sx={{ fontSize: '0.8125rem', color: 'text.secondary', minWidth: 0 }}>
            {file.name} · {fileSizeLabel(file.size)}
          </Typography>
        ) : null}
      </Box>

      {profile?.playniteLastImportAt ? (
        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 1 }}>
          Last imported {relativeDay(profile.playniteLastImportAt)}
          {profile.playniteLastGeneratedAtUtc ? ` · export made ${formatCalendarDate(profile.playniteLastGeneratedAtUtc)}` : ''}
          {profile.playniteLastTotal ? ` · ${profile.playniteLastTotal} games` : ''}
        </Typography>
      ) : null}

      {dropStatusMessage(dropStatus) ? (
        <Typography data-testid="playnite-auto-import" sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.5 }}>
          {dropStatusMessage(dropStatus)}
        </Typography>
      ) : null}

      {busy === 'dryRun' ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
          <CircularProgress size={18} aria-label="Checking your export" />
          <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Checking your export…</Typography>
        </Box>
      ) : null}

      {error ? (
        <Alert severity="error" sx={{ mt: 2 }} data-testid="playnite-error">
          {error}
        </Alert>
      ) : null}

      {!error && busy !== 'dryRun' ? (
        <PlaynitePreview preview={preview} includeHidden={includeHidden} onToggleIncludeHidden={handleToggleIncludeHidden} hiddenCount={hiddenCount} />
      ) : null}

      {canCommit ? (
        <Button variant="contained" onClick={handleCommit} disabled={Boolean(busy)} sx={{ mt: 2 }}>
          {busy === 'commit' ? 'Importing…' : `Import ${s.actionable} ${s.actionable === 1 ? 'game' : 'games'}`}
        </Button>
      ) : null}
    </SettingsCard>
  );
}
