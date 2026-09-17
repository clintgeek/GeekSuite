import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '@geeksuite/ui';
import { SectionLabel, DisplayHeading } from '../components/primitives';
import {
  fetchStagedShareFile,
  uploadBodyCompFile,
  extractBodyCompUpload,
  acceptBodyCompUpload,
} from '../services/bodyCompUploadService.js';

// Minimal intake screen. This is where BOTH ways of getting a scan file
// into the app land:
//   1. Android share sheet -> Web Share Target POST /share-target -> the
//      backend stages the bytes and 303-redirects here with ?stagedId=...
//      (see shareTargetController.js for the full CSRF reasoning).
//   2. The plain <input type="file"> below — the permanent fallback, since
//      iOS Safari implements outbound navigator.share() only, never Web
//      Share Target, and it's also useful on desktop / for re-importing an
//      old scan.
// Both paths call the same POST /api/body-comp/uploads endpoint, and once
// that lands, this screen immediately triggers extraction
// (POST /api/body-comp/uploads/:id/extract — DOCS/BODY_COMPOSITION_INTAKE.md
// §10) and renders whatever it comes back with: a clean save, a mismatch
// table (§6), a duplicate, or an unavailable model. Every one of those is a
// normal outcome to show, not an error state — only a genuine network/server
// failure reads as ERROR here.

const ERROR_MESSAGES = {
  no_file: 'No file was shared.',
  unsupported_type: 'That file type is not supported. Share a PDF or an image.',
  file_too_large: 'That file is too large.',
  server_error: 'Something went wrong receiving the shared file.',
};

const STATUS = {
  IDLE: 'idle',
  CLAIMING: 'claiming',
  UPLOADING: 'uploading',
  EXTRACTING: 'extracting',
  SUCCESS: 'success',
  ERROR: 'error',
};

/**
 * Display-only rounding for a gate check's computed/printed pair.
 *
 * `validate()` (packages/schemas/fitnessgeek/bodyCompositionDerivation.js)
 * deliberately keeps full float precision — `44.19924337957124` is the
 * honest result of dividing two lb values, and rounding it before comparing
 * against tolerance would weaken the gate. But that same float on SCREEN
 * reads as broken rather than correct: nobody printed 44.19924337957124
 * anywhere, and a real mismatch on the 2026-09-17 scan looked exactly like a
 * bug because of it. This only formats what's rendered; the values compared
 * and stored are untouched.
 *
 * The report itself prints one decimal for every mass/percentage/BMI/SMI
 * figure and a whole number for BMR (see the derivation table in
 * DOCS/BODY_COMPOSITION_INTAKE.md §5.4) — display rounds to match that, not
 * arbitrarily.
 */
function formatCheckValue(key, value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return key === 'bmr_kcal' ? Math.round(value).toString() : value.toFixed(1);
}

/** One row of the mismatch/verification table — a label plus computed vs. printed. */
function ValidationCheckRow({ check }) {
  const tone = check.ok ? 'success.main' : 'error.main';
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0.25,
        py: 1,
        px: 1.25,
        borderRadius: 1.5,
        bgcolor: check.ok ? 'action.hover' : 'error.main',
        // A failing row gets a light tinted background, not a loud solid
        // one — this still needs to read as "flagged," not "broken."
        backgroundColor: check.ok ? 'action.hover' : 'rgba(211, 47, 47, 0.08)',
      }}
    >
      <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600 }}>{check.label}</Typography>
      <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
        Computed {formatCheckValue(check.key, check.computed)} · Printed {formatCheckValue(check.key, check.printed)}
        {' · '}
        <Box component="span" sx={{ color: tone, fontWeight: 600 }}>
          {check.ok ? 'match' : `off by ${Math.abs(check.delta).toFixed(2)}`}
        </Box>
      </Typography>
    </Box>
  );
}

/**
 * Human labels for the stored primaries `classifyMismatches` names in
 * `suspectPrimaries` — those are field names (`bone_mass_lb`,
 * `left_arm.muscle_lb`), not copy. Falls back to the raw key for anything
 * not listed here rather than hiding it, since an unlisted suspect is still
 * something the user needs told about.
 */
const PRIMARY_LABELS = {
  weight_value: 'Weight',
  body_fat_mass_lb: 'Body fat mass',
  body_water_l: 'Body water',
  protein_lb: 'Protein',
  bone_mass_lb: 'Bone mass',
  skeletal_muscle_lb: 'Skeletal muscle',
  subcutaneous_fat_lb: 'Subcutaneous fat',
  visceral_fat_index: 'Visceral fat index',
  height_cm: 'Height',
  'left_arm.muscle_lb': 'Left arm muscle',
  'right_arm.muscle_lb': 'Right arm muscle',
  'left_leg.muscle_lb': 'Left leg muscle',
  'right_leg.muscle_lb': 'Right leg muscle',
};
const labelForPrimary = (key) => PRIMARY_LABELS[key] || key;

/**
 * The partial-accept guidance block, shown only for a `mismatch` outcome
 * (DOCS/BODY_COMPOSITION_INTAKE.md §6, extended by `classifyMismatches`).
 *
 * Two very different messages live here on purpose:
 *   - `safeToAccept` — every stored primary a failing check touches was
 *     independently confirmed by some OTHER passing check, so the only thing
 *     wrong is the printed witness. Say that plainly and offer the single
 *     action that matters: save it anyway.
 *   - not safe — a stored number is itself implicated. Name it
 *     (`suspectPrimaries`) so the user knows what to double-check on a
 *     re-scan, and offer NOTHING that saves — a one-tap save here is exactly
 *     the failure mode the gate exists to prevent.
 */
function MismatchGuidance({ classification, accepting, onAccept }) {
  if (classification.safeToAccept) {
    return (
      <Box sx={{ mt: 1.5, textAlign: 'left' }}>
        <Typography sx={{ fontSize: '0.8125rem', color: 'success.main', fontWeight: 600, mb: 1 }}>
          The measurements check out — only a printed figure on the report didn't match what we recomputed from it.
        </Typography>
        <Button
          variant="contained"
          color="success"
          onClick={onAccept}
          disabled={accepting}
          sx={{ minHeight: 44, minWidth: 44 }}
        >
          {accepting ? <CircularProgress size={20} color="inherit" /> : 'Save anyway'}
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 1.5, textAlign: 'left' }}>
      <Typography sx={{ fontSize: '0.8125rem', color: 'error.main', fontWeight: 600, mb: 0.5 }}>
        {classification.suspectPrimaries.length > 0
          ? `Double-check: ${classification.suspectPrimaries.map(labelForPrimary).join(', ')}`
          : 'A stored measurement could not be confirmed.'}
      </Typography>
      <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
        Share the report again for a clean read — this can't be saved as-is.
      </Typography>
    </Box>
  );
}

/** The confirm/mismatch view: every check the gate actually ran, worst first. */
function ValidationDetail({ validation }) {
  const runChecks = (validation?.checks || []).filter((check) => !check.skipped);
  const ordered = [...runChecks].sort((a, b) => Number(a.ok) - Number(b.ok));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, textAlign: 'left', mt: 1 }}>
      {ordered.map((check) => (
        <ValidationCheckRow key={check.key} check={check} />
      ))}
    </Box>
  );
}

/** Human copy for every terminal extraction outcome the server can hand back. */
function extractionSummary(extraction) {
  switch (extraction?.status) {
    case 'saved':
      return { tone: 'success', title: 'Scan saved.', detail: 'Your body-composition scan was read, verified, and logged.' };
    case 'duplicate':
      return { tone: 'success', title: 'Already imported.', detail: extraction.message || 'This scan was already imported.' };
    case 'mismatch':
      return {
        tone: 'error',
        title: 'Needs a look.',
        detail: "Some numbers on the report didn't match what we recomputed from it, so nothing was saved yet.",
      };
    case 'incomplete':
      return {
        tone: 'error',
        title: 'Could not read enough of the scan.',
        detail: extraction.message || 'The scan could not be fully read.',
      };
    case 'refused':
      // Only reachable from a failed accept attempt — see
      // `handleAcceptMismatch`. The client asked to save and the server
      // re-checked and said no, which in practice means the state on screen
      // went stale between the mismatch and the click.
      return {
        tone: 'error',
        title: 'Could not save this.',
        detail: extraction.message || 'A stored measurement could not be confirmed.',
      };
    case 'extraction_failed':
    default:
      return {
        tone: 'error',
        title: "Couldn't read this scan right now.",
        detail: extraction?.message || 'Try again, or share a clearer photo of the report.',
      };
  }
}

function ScanImport() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { notify } = useToast();
  const fileInputRef = useRef(null);

  const [status, setStatus] = useState(STATUS.IDLE);
  const [fileMeta, setFileMeta] = useState(null); // { name, size, mimeType }
  const [uploadResult, setUploadResult] = useState(null);
  const [extraction, setExtraction] = useState(null); // the server's { status, ... } from /extract
  const [errorMessage, setErrorMessage] = useState(null);
  const [accepting, setAccepting] = useState(false); // busy state for the partial-accept "Save anyway" button

  const runUpload = useCallback(async (file) => {
    setStatus(STATUS.UPLOADING);
    setFileMeta({ name: file.name, size: file.size, mimeType: file.type });
    setExtraction(null);
    setErrorMessage(null);
    try {
      const result = await uploadBodyCompFile(file);
      setUploadResult(result);
      notify('Scan uploaded — reading it now…', { tone: 'success' });

      // The upload is only step one. Immediately run extraction against it
      // (DOCS/BODY_COMPOSITION_INTAKE.md §10) so the user sees one flow, not
      // "uploaded" followed by a separate manual step. A failure HERE is
      // still not an ERROR-status page — extractBodyCompUpload only throws
      // for a genuine transport failure; every other outcome (mismatch,
      // duplicate, unavailable model) is a normal `extraction.status` to
      // render below.
      setStatus(STATUS.EXTRACTING);
      const extractionResult = await extractBodyCompUpload(result.id);
      setExtraction(extractionResult);
      setStatus(STATUS.SUCCESS);
    } catch (error) {
      setStatus(STATUS.ERROR);
      setErrorMessage(error.message || 'Upload failed.');
      notify(error.message || 'Upload failed.', { tone: 'error' });
    }
  }, [notify]);

  // Claim a staged share-target file exactly once per stagedId.
  useEffect(() => {
    const stagedId = searchParams.get('stagedId');
    const shareError = searchParams.get('error');

    if (shareError) {
      setStatus(STATUS.ERROR);
      setErrorMessage(ERROR_MESSAGES[shareError] || 'The shared file could not be received.');
      return;
    }

    if (!stagedId) return;

    let cancelled = false;
    setStatus(STATUS.CLAIMING);
    fetchStagedShareFile(stagedId)
      .then((file) => {
        if (cancelled) return;
        return runUpload(file);
      })
      .catch((error) => {
        if (cancelled) return;
        setStatus(STATUS.ERROR);
        setErrorMessage(error.message || 'The shared file could not be retrieved.');
      });

    // Clear the query params so a refresh doesn't try to re-claim an
    // already-consumed (single-use) staged id.
    setSearchParams({}, { replace: true });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The partial-accept action — only ever reachable from a `mismatch` result
  // whose `classification.safeToAccept` was true (`MismatchGuidance` doesn't
  // render the button otherwise). Sends back exactly the candidate/printed/
  // measuredAt the `.../extract` call handed us; the server re-derives the
  // verdict itself rather than trusting ours (bodyCompExtractController.js's
  // `acceptBodyCompUpload`), so nothing here needs to re-check safety first.
  const handleAcceptMismatch = useCallback(async () => {
    if (!uploadResult?.id || !extraction) return;
    setAccepting(true);
    try {
      const accepted = await acceptBodyCompUpload(uploadResult.id, {
        candidate: extraction.candidate,
        printed: extraction.printed,
        measuredAt: extraction.measuredAt,
      });
      setExtraction(accepted);
      if (accepted.status === 'saved' || accepted.status === 'duplicate') {
        notify(accepted.status === 'saved' ? 'Scan saved.' : 'This scan was already imported.', { tone: 'success' });
      } else {
        notify(accepted.message || 'Could not save the scan.', { tone: 'error' });
      }
    } catch (error) {
      notify(error.message || 'Could not save the scan.', { tone: 'error' });
    } finally {
      setAccepting(false);
    }
  }, [uploadResult, extraction, notify]);

  const handleFilePicked = (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-picking the same file later
    if (!file) return;
    runUpload(file);
  };

  const busy = status === STATUS.CLAIMING || status === STATUS.UPLOADING || status === STATUS.EXTRACTING;
  const summary = status === STATUS.SUCCESS && extraction ? extractionSummary(extraction) : null;

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 720, mx: 'auto' }}>
      <Box sx={{ mb: 3 }}>
        <SectionLabel sx={{ mb: 0.75 }}>Import · Body Scan</SectionLabel>
        <DisplayHeading size="page">Import a scan</DisplayHeading>
        <Typography sx={{ color: 'text.secondary', mt: 0.5, fontSize: '0.9375rem' }}>
          Share a body-composition report from your scale's app, or choose a file below.
        </Typography>
      </Box>

      <Box
        sx={{
          border: '1px dashed',
          borderColor: 'divider',
          borderRadius: 2,
          p: { xs: 2.5, sm: 3 },
          textAlign: 'center',
          bgcolor: 'background.paper',
        }}
      >
        {status === STATUS.IDLE && (
          <>
            <InsertDriveFileIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
            <Typography sx={{ mb: 2, fontSize: '0.875rem', color: 'text.secondary' }}>
              PDF or image, up to 10MB.
            </Typography>
          </>
        )}

        {busy && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, py: 2 }}>
            <CircularProgress size={32} />
            <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
              {status === STATUS.CLAIMING && 'Retrieving shared file…'}
              {status === STATUS.UPLOADING && 'Uploading…'}
              {status === STATUS.EXTRACTING && 'Reading your scan…'}
            </Typography>
          </Box>
        )}

        {status === STATUS.SUCCESS && summary && (
          <Box sx={{ py: 1 }}>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 1 }}>
              {fileMeta?.name}
              {uploadResult && ` · ${Math.max(1, Math.round((uploadResult.size || 0) / 1024))} KB`}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 0.5 }}>
              {summary.tone === 'success'
                ? <CheckCircleIcon sx={{ color: 'success.main', fontSize: 22 }} />
                : <ErrorOutlineIcon sx={{ color: 'error.main', fontSize: 22 }} />}
              <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600 }}>{summary.title}</Typography>
            </Box>
            <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mb: 1.5 }}>
              {summary.detail}
            </Typography>

            {/* The mismatch/verification detail — every check the gate actually
                ran (§6), worst first, so it's clear WHICH numbers disagreed
                rather than just that something did. Only rendered when the
                server sent one (mismatch/incomplete/refused), never on a
                clean save. */}
            {extraction?.validation && <ValidationDetail validation={extraction.validation} />}

            {/* The partial-accept fork (§6, `classifyMismatches`) — only for
                a live mismatch, never for `refused` (that path already tried
                and failed, so re-offering the same button would just repeat
                the refusal) and never once something actually saved. */}
            {extraction?.status === 'mismatch' && extraction.classification && (
              <MismatchGuidance
                classification={extraction.classification}
                accepting={accepting}
                onAccept={handleAcceptMismatch}
              />
            )}
          </Box>
        )}

        {status === STATUS.ERROR && (
          <Typography sx={{ fontSize: '0.875rem', color: 'error.main', mb: 2 }}>
            {errorMessage}
          </Typography>
        )}

        <Button
          variant="contained"
          component="label"
          startIcon={<UploadFileIcon />}
          disabled={busy || accepting}
          sx={{ minHeight: 44, mt: status === STATUS.IDLE ? 0 : 2 }}
        >
          Choose file
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/*"
            hidden
            onChange={handleFilePicked}
          />
        </Button>
      </Box>
    </Box>
  );
}

export default ScanImport;
