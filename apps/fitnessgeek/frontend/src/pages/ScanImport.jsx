import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Typography, Button, CircularProgress } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { useToast } from '@geeksuite/ui';
import { errorMessage as friendlyError } from '../utils/errorMessage.js';
import { Page, Surface, Tag } from '../components/primitives';

import {
  fetchStagedShareFile,
  uploadBodyCompFile,
  extractBodyCompUpload,
  acceptBodyCompUpload,
  importBodyCompXlsx,
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
// Both paths call the same POST /api/body-comp/uploads endpoint. What
// happens next depends on WHAT was uploaded, decided purely by the sniffed
// `mimeType` the upload endpoint hands back (never the file's extension —
// see fileSniff.js):
//   - A PDF or image triggers the vision extraction path
//     (POST /api/body-comp/uploads/:id/extract — DOCS/BODY_COMPOSITION_INTAKE.md
//     §10), rendering a clean save, a mismatch table (§6), a duplicate, or an
//     unavailable model.
//   - The Arboleaf app's own ".xlsx" history export triggers the spreadsheet
//     import path instead (POST /api/body-comp/uploads/:id/import-xlsx) — no
//     AI, no confirm screen, and a single file can carry the user's WHOLE
//     scan history, so the outcome is an aggregate
//     {imported, skipped, failed} count rather than one scan's status.
// Every one of those outcomes is normal to show, not an error state — only a
// genuine network/server failure reads as ERROR here.

/** The Arboleaf data export's real MIME type, as `fileSniff.js` identifies it — never guessed from a `.xlsx` extension. */
const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const ERROR_MESSAGES = {
  no_file: 'No file was shared.',
  unsupported_type: 'FitnessGeek can’t read that kind of file. Share a PDF or an image.',
  file_too_large: 'That file is too big. The limit is 10MB.',
  server_error: 'Couldn’t receive the shared file. Try sharing it again.',
};

const STATUS = {
  IDLE: 'idle',
  CLAIMING: 'claiming',
  UPLOADING: 'uploading',
  EXTRACTING: 'extracting',
  IMPORTING: 'importing', // the xlsx bulk-import path — see this file's header
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
  return key === 'bmr_kcal' ? Math.round(value).toLocaleString('en-US') : value.toFixed(1);
}

/** One row of the mismatch/verification table — a label plus computed vs. printed. */
function ValidationCheckRow({ check, first }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        py: 3,
        borderTop: first ? 0 : (t) => `1px solid ${t.palette.divider}`,
      }}
    >
      <Typography sx={{ fontSize: '0.875rem', fontWeight: 700 }}>{check.label}</Typography>
      <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
        Worked out {formatCheckValue(check.key, check.computed)} · On the report {formatCheckValue(check.key, check.printed)}
        {' · '}
        {/* A flagged row says so in words, in a status-coloured tag — never
            a tinted row. */}
        {check.ok ? (
          <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>match</Box>
        ) : (
          <Tag tone="error">{`off by ${Math.abs(check.delta).toFixed(2)}`}</Tag>
        )}
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
  visceral_fat_index: 'Belly fat score (visceral fat)',
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
      <Box sx={{ mt: 4, textAlign: 'left' }}>
        <Typography sx={{ fontSize: '0.875rem', color: 'text.primary', fontWeight: 600, lineHeight: 1.5, mb: 3 }}>
          The measurements check out — only a printed figure on the report didn’t match what I worked out from it.
        </Typography>
        <Button
          variant="tonal"
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
    <Box sx={{ mt: 4, textAlign: 'left' }}>
      <Typography sx={{ fontSize: '0.875rem', color: 'text.primary', fontWeight: 600, mb: 1 }}>
        {classification.suspectPrimaries.length > 0
          ? `Double-check: ${classification.suspectPrimaries.map(labelForPrimary).join(', ')}`
          : 'A measurement couldn’t be confirmed.'}
      </Typography>
      <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
        Share the report again for a clean read — this can’t be saved as-is.
      </Typography>
    </Box>
  );
}

/** The confirm/mismatch view: every check the gate actually ran, worst first. */
function ValidationDetail({ validation }) {
  const runChecks = (validation?.checks || []).filter((check) => !check.skipped);
  const ordered = [...runChecks].sort((a, b) => Number(a.ok) - Number(b.ok));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', textAlign: 'left', mt: 4, borderTop: (t) => `1px solid ${t.palette.divider}` }}>
      {ordered.map((check, i) => (
        <ValidationCheckRow key={check.key} check={check} first={i === 0} />
      ))}
    </Box>
  );
}

/**
 * Human copy for the spreadsheet import outcome — plain counts, no
 * per-check validation table (there's no single scan's numbers to show; a
 * whole file's worth of rows already ran the gate server-side, and
 * `results` carries the per-row detail for anyone who wants it, but this
 * screen stays minimal per the task's own instruction: report the outcome
 * plainly, e.g. "imported 5 scans, skipped 1 already present").
 */
function xlsxImportSummary(extraction) {
  if (extraction.status === 'unreadable') {
    return {
      tone: 'error',
      title: 'Couldn’t read this file',
      detail: extraction.message || 'It doesn’t look like a spreadsheet export from your scale’s app.',
    };
  }

  const { imported = 0, skipped = 0, failed = 0 } = extraction;
  const parts = [`imported ${imported} scan${imported === 1 ? '' : 's'}`];
  if (skipped > 0) parts.push(`skipped ${skipped} already present`);
  if (failed > 0) parts.push(`couldn’t check ${failed}`);
  const detail = `${parts.join(', ')}.`;

  return {
    // Success reads as "at least one row is now safely in the history," even
    // if some rows were skipped as duplicates — a re-import of an
    // already-imported file (§7) is a normal, successful no-op, not an
    // error. Only "nothing imported AND something failed the gate" reads as
    // an error tone.
    tone: imported > 0 || failed === 0 ? 'success' : 'error',
    title: imported > 0 ? 'Scan history imported' : skipped > 0 ? 'Already imported' : 'Nothing to import',
    detail: detail.charAt(0).toUpperCase() + detail.slice(1),
  };
}

/** Human copy for every terminal extraction outcome the server can hand back. */
function extractionSummary(extraction) {
  if (extraction?.kind === 'xlsxImport') return xlsxImportSummary(extraction);

  switch (extraction?.status) {
    case 'saved':
      return { tone: 'success', title: 'Scan saved', detail: 'Your body-composition scan was read, checked and saved.' };
    case 'duplicate':
      return { tone: 'success', title: 'Already imported', detail: extraction.message || 'This scan was already imported.' };
    case 'mismatch':
      return {
        tone: 'error',
        title: 'Needs a look',
        detail: 'Some numbers on the report didn’t match what I worked out from it, so nothing is saved yet.',
      };
    case 'incomplete':
      return {
        tone: 'error',
        title: 'Couldn’t read enough of the scan',
        detail: extraction.message || 'Part of the scan couldn’t be read. Try a clearer photo of the report.',
      };
    case 'refused':
      // Only reachable from a failed accept attempt — see
      // `handleAcceptMismatch`. The client asked to save and the server
      // re-checked and said no, which in practice means the state on screen
      // went stale between the mismatch and the click.
      return {
        tone: 'error',
        title: 'Couldn’t save this',
        detail: extraction.message || 'A measurement couldn’t be confirmed.',
      };
    case 'extraction_failed':
    default:
      return {
        tone: 'error',
        title: 'Couldn’t read this scan right now',
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

      // Which path runs next depends entirely on the SNIFFED mimeType the
      // upload endpoint handed back, never on the file's name/extension —
      // matching the sniff-don't-trust rule the whole intake pipeline is
      // built around (fileSniff.js).
      if (result.mimeType === XLSX_MIME_TYPE) {
        notify('Spreadsheet uploaded — importing your scan history…', { tone: 'success' });
        setStatus(STATUS.IMPORTING);
        const importResult = await importBodyCompXlsx(result.id);
        setExtraction({ kind: 'xlsxImport', ...importResult });
        setStatus(STATUS.SUCCESS);
        return;
      }

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
      setExtraction({ kind: 'extraction', ...extractionResult });
      setStatus(STATUS.SUCCESS);
    } catch (error) {
      setStatus(STATUS.ERROR);
      // Said once, in the card where the person is looking (no second toast).
      setErrorMessage(friendlyError(error, "That didn’t upload. Try again."));
    }
  }, [notify]);

  // Claim a staged share-target file exactly once per stagedId.
  useEffect(() => {
    const stagedId = searchParams.get('stagedId');
    const shareError = searchParams.get('error');

    if (shareError) {
      setStatus(STATUS.ERROR);
      setErrorMessage(ERROR_MESSAGES[shareError] || 'Couldn’t receive the shared file. Try sharing it again.');
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
        setErrorMessage(friendlyError(error, 'Couldn’t get the shared file — it may have expired. Share it again.'));
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
        notify(accepted.status === 'saved' ? 'Scan saved' : 'This scan was already imported', { tone: 'success' });
      } else {
        notify(accepted.message || 'Couldn’t save the scan. Try again.', { tone: 'error' });
      }
    } catch (error) {
      notify(friendlyError(error, "Couldn’t save the scan. Try again."), { tone: 'error' });
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

  const busy = status === STATUS.CLAIMING || status === STATUS.UPLOADING
    || status === STATUS.EXTRACTING || status === STATUS.IMPORTING;
  const summary = status === STATUS.SUCCESS && extraction ? extractionSummary(extraction) : null;

  const saved = extraction?.status === 'saved' || extraction?.status === 'duplicate'
    || (extraction?.kind === 'xlsxImport' && summary?.tone === 'success');

  return (
    <Page narrow>
      {/* The top bar says "Import a scan"; the card does not say it again.
          Written for a person who has never seen this page: what a scan is,
          what to bring, where it ends up. */}
      <Typography sx={{ color: 'text.secondary', fontSize: '1rem', lineHeight: 1.5 }}>
        If your scale measures body fat, add its report here. Your Weight page then shows how much of your weight is fat and how much is muscle.
      </Typography>

      <Surface sx={{ textAlign: 'left' }}>
        {(status === STATUS.IDLE || status === STATUS.ERROR) && (
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 3, mb: 4 }}>
            <InsertDriveFileIcon aria-hidden sx={{ fontSize: 28, color: 'text.secondary', flexShrink: 0, mt: 0.5 }} />
            <Box sx={{ minWidth: 0 }}>
              <Typography component="h2" sx={{ m: 0, fontSize: '1.0625rem', fontWeight: 700, lineHeight: 1.3 }}>
                Choose the report from your scale’s app
              </Typography>
              <Typography sx={{ fontSize: '0.9375rem', color: 'text.secondary', lineHeight: 1.5, mt: 1 }}>
                A PDF or a photo of one scan, or the spreadsheet export of your whole history. Up to 10 MB.
              </Typography>
            </Box>
          </Box>
        )}

        {busy && (
          <Box role="status" aria-live="polite" sx={{ display: 'flex', alignItems: 'center', gap: 3, py: 2 }}>
            <CircularProgress size={28} />
            <Typography sx={{ fontSize: '0.9375rem', color: 'text.secondary' }}>
              {status === STATUS.CLAIMING && 'Getting the shared file…'}
              {status === STATUS.UPLOADING && 'Uploading…'}
              {status === STATUS.EXTRACTING && 'Reading your scan. This can take a minute…'}
              {status === STATUS.IMPORTING && 'Importing your scan history…'}
            </Typography>
          </Box>
        )}

        {status === STATUS.SUCCESS && summary && (
          <Box role="status" aria-live="polite">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
              {summary.tone === 'success'
                ? <CheckCircleIcon aria-hidden sx={{ color: 'success.main', fontSize: 22 }} />
                : <ErrorOutlineIcon aria-hidden sx={{ color: 'error.main', fontSize: 22 }} />}
              <Typography component="h2" sx={{ m: 0, fontSize: '1.125rem', fontWeight: 700 }}>{summary.title}</Typography>
            </Box>
            <Typography sx={{ fontSize: '0.9375rem', color: 'text.secondary', lineHeight: 1.5 }}>
              {summary.detail}
            </Typography>
            {fileMeta?.name && (
              <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 1, overflowWrap: 'anywhere' }}>
                {fileMeta.name}
                {uploadResult && ` · ${Math.max(1, Math.round((uploadResult.size || 0) / 1024))} KB`}
              </Typography>
            )}

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
          <Alert severity="error" role="alert" sx={{ mb: 4 }}>
            {errorMessage}
          </Alert>
        )}

        {/* One filled button. After a save it is "See it on your Weight page"
            and choosing another file steps back to second rank. */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, mt: status === STATUS.SUCCESS || busy ? 4 : 0 }}>
          {saved && (
            <Button
              component={RouterLink}
              to="/weight#body-composition"
              variant="contained"
              sx={{ minHeight: 52, width: { xs: '100%', sm: 'auto' } }}
            >
              See it on your Weight page
            </Button>
          )}
          <Button
            variant={saved ? 'tonal' : 'contained'}
            component="label"
            startIcon={<UploadFileIcon />}
            disabled={busy || accepting}
            sx={{ minHeight: 52, width: { xs: '100%', sm: 'auto' } }}
          >
            {status === STATUS.IDLE ? 'Choose file' : status === STATUS.ERROR ? 'Choose a file again' : 'Choose another file'}
            <input
              ref={fileInputRef}
              type="file"
              accept={`application/pdf,image/*,.xlsx,${XLSX_MIME_TYPE}`}
              hidden
              onChange={handleFilePicked}
            />
          </Button>
        </Box>
      </Surface>
    </Page>
  );
}

export default ScanImport;
