import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Typography, TextField, Button, Chip, Stack, IconButton, ToggleButton, ToggleButtonGroup, FormControl, InputLabel, Select, MenuItem, Alert } from '@mui/material';
import { useToast } from '@geeksuite/ui';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import MedicationIcon from '@mui/icons-material/Medication';
import LocalPharmacyIcon from '@mui/icons-material/LocalPharmacy';
import medsService from '../services/medsService.js';
import { localDateString } from '@geeksuite/utils';
import { Surface, SectionLabel, DisplayHeading, EmptyState } from '../components/primitives';
import MedsChecklist from '../components/Home/MedsChecklist.jsx';
import { useMedsToday, announceMedsChanged } from '../hooks/useMedsToday.js';
import { useToday } from '../hooks/useToday.js';
import { errorMessage } from '../utils/errorMessage.js';

const TIME_OPTIONS = ['morning', 'afternoon', 'evening', 'bedtime'];

// A medication with no time of day set is one daily dose (checkIns.js). It
// used to match none of the four slot groups below, so it saved and then
// vanished from the list: no way to see, edit or remove it (REVIEW B14).
const hasNoTime = (m) => !(m.times_of_day || []).length;
const MED_GROUPS = [
  { key: 'daily', label: 'Daily', match: hasNoTime },
  ...TIME_OPTIONS.map((slot) => ({ key: slot, label: slot, match: (m) => (m.times_of_day || []).includes(slot) })),
];
const TYPE_ORDER = { rx: 0, otc: 1, supplement: 2 };
const byTypeThenName = (a, b) => {
  const tA = (a.med_type || 'rx');
  const tB = (b.med_type || 'rx');
  if (TYPE_ORDER[tA] !== TYPE_ORDER[tB]) return TYPE_ORDER[tA] - TYPE_ORDER[tB];
  return (a.display_name || '').localeCompare(b.display_name || '');
};

// The fields a medication is saved with: what Undo re-creates a removed one from.
const MED_INPUT_KEYS = ['display_name', 'is_supplement', 'med_type', 'rxcui', 'ingredient_name', 'brand_name', 'form', 'route', 'strength', 'dose_value', 'dose_unit', 'sig', 'times_of_day', 'suggested_indications', 'user_indications', 'notes'];
const medInputFrom = (med) => {
  const input = {};
  for (const key of MED_INPUT_KEYS) {
    if (med[key] !== undefined && med[key] !== null) input[key] = med[key];
  }
  return input;
};

function SuggestionChips({ suggestions, userTags, onChange }) {
  const selected = new Set(userTags || []);
  return (
    <Stack direction="row" spacing={1} flexWrap="wrap">
      {(suggestions || []).map((tag) => (
        <Chip
          key={tag}
          label={tag}
          color={selected.has(tag) ? 'primary' : 'default'}
          variant={selected.has(tag) ? 'filled' : 'outlined'}
          onClick={() => {
            const next = new Set(selected);
            if (next.has(tag)) next.delete(tag); else next.add(tag);
            onChange(Array.from(next));
          }}
          // These are tappable (onClick above), so the 44px floor applies —
          // MUI's default Chip is 32px high, 24px at size="small".
          sx={{ mb: 1, height: 44 }}
        />
      ))}
    </Stack>
  );
}

export default function Medications() {
  // Today's doses — the dose log had a backend and no UI until now.
  // useToday, not a date read at render: a resumed PWA must tick today (B3).
  const today = useToday();
  const doses = useMedsToday(today);
  const { notify } = useToast();
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);
  // The query the last finished search ran, and whether it failed — so
  // "nothing found" and "search is down" can both offer "add it as typed".
  const [searchedFor, setSearchedFor] = useState('');
  const [searchError, setSearchError] = useState(null);
  const [listLoading, setListLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  // One write at a time: 'save' | 'update' | the id being removed.
  const [busy, setBusy] = useState(null);
  const [formError, setFormError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [details, setDetails] = useState(null);
  const [selectedStrength, setSelectedStrength] = useState(null);
  const [myMeds, setMyMeds] = useState([]);
  const [editingMed, setEditingMed] = useState(null);

  const [displayName, setDisplayName] = useState('');
  const [timesOfDay, setTimesOfDay] = useState([]);
  const [userTags, setUserTags] = useState([]);
  const [newTag, setNewTag] = useState('');
  const [medType, setMedType] = useState('rx');

  const editorRef = useRef(null);
  const nameInputRef = useRef(null);

  const scrollToEditorFocus = () => {
    setTimeout(() => {
      if (editorRef.current) {
        // Optional-called: jsdom (and some embedded browsers) have no
        // scrollIntoView, and a throw here escaped as an unhandled error.
        editorRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      }
      if (nameInputRef.current) {
        try { nameInputRef.current.focus(); } catch (_) {}
      }
    }, 0);
  };

  // Refill tracking (days supply, days left, run-out, the low-supply border)
  // was removed on 2026-09-27. Chef: "just too complicated to keep updated and
  // the mail order places do it automatically anyway." The stored
  // supply_start_date / days_supply fields are left alone: saves omit them,
  // and the backend keeps what's there.
  const buildExportText = () => {
    const lines = [];
    lines.push('Medications & Supplements');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');
    MED_GROUPS.forEach(group => {
      const slotMeds = (myMeds || []).filter(group.match).sort(byTypeThenName);
      if (slotMeds.length === 0) return;
      lines.push(`${group.label.toUpperCase()}`);
      slotMeds.forEach(m => {
        const type = (m.med_type || 'rx').toUpperCase();
        const strength = m.strength ? ` ${m.strength}` : '';
        const tags = (m.user_indications || []).join(', ');
        lines.push(`- ${m.display_name}${strength} [${type}]${tags ? ` | Indications: ${tags}` : ''}`);
      });
      lines.push('');
    });
    return lines.join('\n');
  };

  const handleCopyExport = async () => {
    const text = buildExportText();
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      // no-op
    }
  };

  const handleDownloadExport = () => {
    const text = buildExportText();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `medications_${localDateString()}.txt`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
  };

  const handleDownloadPdf = async () => {
    // jspdf is ~590 kB minified with its optional canvg/dompurify tail and is
    // reachable only from this button; a module-scope import put it on the
    // /medications route load. (html2canvas used to be imported here too and
    // was never called — it went with the static import.)
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const page = { w: 612, h: 792 };
    const margin = 40;
    let y = margin;

    const bySlot = MED_GROUPS.map(group => ({
      slot: group.label,
      meds: (myMeds || []).filter(group.match).sort(byTypeThenName),
    })).filter(s => s.meds.length > 0);

    // Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Medications & Supplements', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, margin, y + 16);
    y += 36;

    // Legend
    const legend = [
      { label: 'RX = Prescription', color: '#263238' },
      { label: 'OTC = Over-the-counter', color: '#263238' },
      { label: 'SUPPLEMENT', color: '#263238' },
    ];
    legend.forEach((l, i) => {
      doc.setFontSize(10);
      doc.text(l.label, margin + i * 170, y);
    });
    y += 16;

    const drawSectionHeader = (title) => {
      // Gray band with section title
      doc.setFillColor('#ECEFF1');
      doc.rect(margin, y, page.w - margin * 2, 22, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(title.toUpperCase(), margin + 8, y + 15);
      y += 26;
    };

    const columns = [
      { key: 'name', title: 'Name', width: 240 },
      { key: 'type', title: 'Type', width: 80 },
      { key: 'ind', title: 'Indications', width: 210 },
    ];

    const drawTableHeader = () => {
      doc.setFillColor('#F5F5F5');
      doc.rect(margin, y, page.w - margin * 2, 22, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      let x = margin + 8;
      columns.forEach(col => {
        doc.text(col.title, x, y + 14);
        x += col.width;
      });
      y += 26;
    };

    const ensureRoom = (needed = 26) => {
      if (y + needed > page.h - margin) {
        doc.addPage();
        y = margin;
      }
    };

    const drawRow = (row, idx) => {
      const rowHeight = 18 * Math.max(
        1,
        ...columns.map(col => doc.splitTextToSize(row[col.key] || '', col.width - 8).length)
      );
      ensureRoom(rowHeight + 6);
      // alternate row fill
      if (idx % 2 === 0) {
        doc.setFillColor('#FAFAFA');
        doc.rect(margin, y - 4, page.w - margin * 2, rowHeight + 8, 'F');
      }
      let x = margin + 8;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      columns.forEach(col => {
        const text = doc.splitTextToSize(row[col.key] || '', col.width - 8);
        doc.text(text, x, y);
        x += col.width;
      });
      y += rowHeight + 6;
    };

    bySlot.forEach(section => {
      ensureRoom(60);
      drawSectionHeader(section.slot);
      drawTableHeader();
      const rows = section.meds.map(m => ({
        name: m.display_name || '',
        type: (m.med_type || 'rx').toUpperCase(),
        ind: (m.user_indications || []).join(', '),
      }));
      rows.forEach((r, idx) => drawRow(r, idx));
      y += 6;
    });

    // Footer page numbers
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(9);
      doc.text(`Page ${i} of ${pageCount}`, page.w - margin - 80, page.h - margin / 2);
    }

    doc.save(`medications_${localDateString()}.pdf`);
  };

  const loadMeds = useCallback(() => {
    setListLoading(true);
    // medsService already unwraps the transport envelope — `list()` resolves to
    // the medication array itself, not `{ data: [...] }`. Reading `.data` off it
    // here (as this page used to) silently produced an empty list on every load.
    // A failed load says so; it used to read "No medications yet".
    return medsService.list()
      .then((r) => { setMyMeds(Array.isArray(r) ? r : []); setLoadError(null); })
      .catch((err) => setLoadError(errorMessage(err, 'Check your connection and try again.')))
      .finally(() => setListLoading(false));
  }, []);

  useEffect(() => { loadMeds(); }, [loadMeds]);

  // The list changed: this page's checklist and Home's both reload.
  const changed = () => announceMedsChanged();

  const handleSearch = async () => {
    const query = q.trim();
    if (!query || searching) return;
    setSearching(true);
    setSearchError(null);
    try {
      const r = await medsService.search(query);
      // Same rule: `search()` resolves to the candidate array.
      setResults(Array.isArray(r) ? r : []);
    } catch (err) {
      setResults([]);
      setSearchError(errorMessage(err, "The medicine search isn't answering right now."));
    } finally {
      setSearchedFor(query);
      setSearching(false);
    }
  };

  // RxNorm doesn't know most supplements, and it can be down. Neither should
  // stop her adding "Vitamin D" (REVIEW B16).
  const addAsTyped = () => {
    const name = searchedFor;
    if (!name) return;
    setSelected({ name, typed: true });
    setDisplayName(name);
    setDetails({ strengths: [], suggested: [] });
    setUserTags([]);
    setSelectedStrength(null);
    setEditingMed(null);
    setFormError(null);
    scrollToEditorFocus();
  };

  const selectCandidate = async (c) => {
    setFormError(null);
    setSelected(c);
    setDisplayName(c?.name || '');
    try {
      const d = await medsService.getDetails(c.rxcui);
      // `getDetails()` resolves to { ingredient, strengths, atcClasses, epcClasses, suggested }.
      setDetails(d || { strengths: [], suggested: [] });
      setUserTags(d?.suggested || []);
    } catch (_) {
      setDetails({ strengths: [], suggested: [] });
    }
    setSelectedStrength(null);
    setEditingMed(null);
    scrollToEditorFocus();
  };

  const buildPayload = () => ({
    display_name: displayName || selected?.name || q,
    is_supplement: false,
    med_type: medType,
    rxcui: (selected?.rxcui || editingMed?.rxcui) || null,
    ingredient_name: details?.ingredient?.name || editingMed?.ingredient_name || null,
    strength: selectedStrength?.name || editingMed?.strength || null,
    times_of_day: timesOfDay,
    suggested_indications: details?.suggested || editingMed?.suggested_indications || [],
    user_indications: userTags,
  });

  const saveMedication = async () => {
    if (busy) return;
    const payload = buildPayload();
    setBusy('save');
    setFormError(null);
    try {
      // `save()` resolves to the saved medication itself, not `{ data: med }`.
      // Gateway shape: `id`, not `_id` — `fitnessMedications`/`addFitnessMedication`
      // never carry `_id`, so this dedupe always matched `undefined === undefined`
      // and dropped every existing medication from the list on each add.
      const saved = await medsService.save(payload);
      if (!saved) throw new Error('No medication came back');
      const savedId = saved.id ?? saved._id;
      setMyMeds((prev) => [saved, ...prev.filter(m => (m.id ?? m._id) !== savedId)]);
      setSelected(null);
      setEditingMed(null);
      changed();
    } catch (err) {
      setFormError(errorMessage(err, "Couldn't save that medicine. Try again."));
    } finally {
      setBusy(null);
    }
  };

  const updateMedication = async () => {
    if (!editingMed || busy) return;
    const payload = buildPayload();
    const editingId = editingMed.id ?? editingMed._id;
    setBusy('update');
    setFormError(null);
    try {
      const saved = await medsService.update(editingId, payload);
      if (!saved) throw new Error('No medication came back');
      setMyMeds(prev => prev.map(m => ((m.id ?? m._id) === editingId ? saved : m)));
      setSelected(null);
      setEditingMed(null);
      changed();
    } catch (err) {
      setFormError(errorMessage(err, "Couldn't save your changes. Try again."));
    } finally {
      setBusy(null);
    }
  };

  const cancelEdit = () => {
    setFormError(null);
    setSelected(null);
    setEditingMed(null);
    setDisplayName('');
    setTimesOfDay([]);
    setUserTags([]);
    setSelectedStrength(null);
    setDetails(null);
    setMedType('rx');
  };

  const startEdit = async (m) => {
    setFormError(null);
    setEditingMed(m);
    setSelected(null);
    setDisplayName(m.display_name || '');
    setTimesOfDay(m.times_of_day || []);
    setUserTags(m.user_indications || []);
    setMedType(m.med_type || 'rx');
    setSelectedStrength(null);
    if (m.rxcui) {
      try {
        const d = await medsService.getDetails(m.rxcui);
        setDetails(d || { strengths: [], suggested: [] });
        const found = (d?.strengths || []).find(s => s.name === m.strength);
        if (found) setSelectedStrength(found);
      } catch (_) {
        setDetails({ strengths: [], suggested: [] });
      }
    } else {
      setDetails({ strengths: [], suggested: [] });
    }
    scrollToEditorFocus();
  };

  // Undo re-creates the removed medicine from the row's own fields — the same
  // grammar as removing a food ("Removed … · Undo"). It comes back as a new
  // medication; today's ticks for the old one don't follow it.
  const restoreMed = async (med) => {
    try {
      const saved = await medsService.save(medInputFrom(med));
      if (!saved) throw new Error('No medication came back');
      setMyMeds((prev) => [saved, ...prev]);
      changed();
      notify(`${med.display_name || 'Medicine'} is back`, { tone: 'success' });
    } catch (err) {
      notify(errorMessage(err, "Couldn't bring it back. Try again."), { tone: 'error' });
    }
  };

  const removeMed = async (med) => {
    if (busy) return;
    const medId = med.id ?? med._id;
    setBusy(medId);
    try {
      // Throws on a `false` answer: nothing was removed, so nothing is said to be.
      await medsService.remove(medId);
      setMyMeds(prev => prev.filter(m => (m.id ?? m._id) !== medId));
      changed();
      notify(`Removed ${med.display_name || 'medicine'}`, {
        tone: 'info',
        action: (
          <Button size="small" sx={{ color: 'inherit', fontWeight: 800 }} onClick={() => restoreMed(med)}>
            Undo
          </Button>
        ),
      });
    } catch (err) {
      notify(errorMessage(err, "Couldn't remove that. Try again."), { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  // Helper to get med type color
  const getMedTypeColor = (type) => {
    switch(type) {
      case 'rx': return { bg: '#E3F2FD', color: '#1565C0', label: 'RX' };
      case 'otc': return { bg: '#E8F5E9', color: '#2E7D32', label: 'OTC' };
      case 'supplement': return { bg: '#FFF3E0', color: '#E65100', label: 'SUPPLEMENT' };
      default: return { bg: '#F5F5F5', color: '#616161', label: 'OTHER' };
    }
  };

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 960, mx: 'auto' }}>
      <Box sx={{ mb: 3 }}>
        <Typography sx={{ color: 'text.secondary', fontSize: '1.0625rem' }}>
          Tick off today&apos;s doses, manage your medicines, and export a list for your doctor.
        </Typography>
      </Box>

      {doses.total > 0 && (
        <Surface sx={{ mb: 3, borderRadius: '24px' }}>
          <MedsChecklist
            title="Today's doses"
            items={doses.items}
            taken={doses.taken}
            total={doses.total}
            onToggle={doses.toggle}
            saving={doses.saving}
            error={doses.error}
          />
        </Surface>
      )}

      {/* Export Buttons */}
      {/* `size="small"` renders these under the 44px tap floor the mobile
          harness enforces. minHeight only — the compact look is unchanged. */}
      <Box sx={{ mb: 3, display: 'flex', gap: 1, flexWrap: 'wrap', '& .MuiButton-root': { minHeight: 44, minWidth: 44 } }}>
        <Button size="small" variant="outlined" onClick={handleCopyExport}>Copy text</Button>
        <Button size="small" variant="outlined" onClick={handleDownloadExport}>Download .txt</Button>
        <Button size="small" variant="outlined" onClick={handleDownloadPdf}>Download PDF</Button>
      </Box>

      {/* Search Surface */}
      <Surface sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 2 }}>
          <SearchIcon sx={{ color: 'primary.main' }} />
          <SectionLabel>Search Medications</SectionLabel>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
          <TextField
            fullWidth
            size="small"
            label="Search medication (brand or generic)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button
            variant="contained"
            startIcon={<SearchIcon />}
            onClick={handleSearch}
            disabled={searching || !q.trim()}
            sx={{ minWidth: 120, flexShrink: 0 }}
          >
            {searching ? 'Searching…' : 'Search'}
          </Button>
        </Stack>
        {searchError && (
          <Alert severity="warning" sx={{ mt: 2 }}>{searchError}</Alert>
        )}
        {!searching && searchedFor && !searchError && results.length === 0 && (
          <Typography sx={{ mt: 2, color: 'text.secondary' }}>
            Nothing found for &ldquo;{searchedFor}&rdquo;.
          </Typography>
        )}
        {results.length > 0 && (
          <Stack spacing={0.5} sx={{ mt: 2, maxHeight: 220, overflowY: 'auto' }}>
            {results.map((r, idx) => (
              <Surface
                key={`${r.rxcui}-${idx}`}
                variant="inset"
                interactive
                onClick={() => selectCandidate(r)}
                sx={{ py: 1.25, px: 1.5 }}
              >
                <Typography sx={{ fontWeight: 600, fontSize: '0.9375rem' }}>{r.name}</Typography>
                <Typography
                  sx={{
                    fontFamily: "inherit",
                    fontSize: '0.75rem',
                    color: 'text.secondary',
                    mt: 0.25,
                  }}
                >
                  RxCUI {r.rxcui}
                </Typography>
              </Surface>
            ))}
          </Stack>
        )}
        {!searching && searchedFor && (
          <Button
            variant={results.length === 0 ? 'contained' : 'text'}
            onClick={addAsTyped}
            sx={{ mt: 2, minHeight: 44 }}
          >
            Add &ldquo;{searchedFor}&rdquo; as typed
          </Button>
        )}
      </Surface>

      {(selected || editingMed) && (
        <Surface ref={editorRef} sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 2 }}>
            <MedicationIcon sx={{ color: 'primary.main' }} />
            <SectionLabel>{editingMed ? 'Edit Medication' : 'Add Medication'}</SectionLabel>
          </Box>
          <Stack spacing={2}>
            <TextField inputRef={nameInputRef} label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            {Array.isArray(details?.strengths) && details.strengths.length > 0 && (
              <FormControl fullWidth>
                <InputLabel id="strength-label">Strength</InputLabel>
                <Select
                  labelId="strength-label"
                  label="Strength"
                  value={selectedStrength ? selectedStrength.rxcui : ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    const found = (details.strengths || []).find(s => s.rxcui === val);
                    setSelectedStrength(found || null);
                  }}
                >
                  {details.strengths.map(s => (
                    <MenuItem key={s.rxcui} value={s.rxcui}>{s.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <FormControl fullWidth>
              <InputLabel id="type-label">Type</InputLabel>
              <Select labelId="type-label" label="Type" value={medType} onChange={(e) => setMedType(e.target.value)}>
                <MenuItem value="rx">Rx (Prescription)</MenuItem>
                <MenuItem value="otc">OTC (Over-the-counter)</MenuItem>
                <MenuItem value="supplement">Supplement</MenuItem>
              </Select>
            </FormControl>
            <Box>
              <Typography variant="caption" color="text.secondary">Time of day</Typography>
              <ToggleButtonGroup
                value={timesOfDay}
                onChange={(e, v) => setTimesOfDay(v)}
                aria-label="time-of-day"
              >
                {TIME_OPTIONS.map(t => (
                  <ToggleButton key={t} value={t} aria-label={t}>{t}</ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>

            {((details?.suggested?.length || 0) > 0) && (
              <Box>
                <Typography variant="caption" color="text.secondary">Suggested indications (editable)</Typography>
                <SuggestionChips suggestions={details.suggested} userTags={userTags} onChange={setUserTags} />
              </Box>
            )}

            <Box>
              <Typography variant="caption" color="text.secondary">Your indications</Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1 }}>
                {(userTags || []).map(tag => (
                  <Chip
                    key={tag}
                    label={tag}
                    onDelete={() => setUserTags((prev) => prev.filter(t => t !== tag))}
                    sx={{ height: 44 }}
                  />
                ))}
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
                <TextField size="small" label="Add tag" value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const t = newTag.trim();
                    if (t && !userTags.includes(t)) setUserTags([...userTags, t]);
                    setNewTag('');
                  }
                }} />
                <Button variant="outlined" onClick={() => {
                  const t = newTag.trim();
                  if (t && !userTags.includes(t)) setUserTags([...userTags, t]);
                  setNewTag('');
                }}>Add</Button>
              </Stack>
            </Box>

            {formError && <Alert severity="error">{formError}</Alert>}
            <Stack direction="row" spacing={1}>
              {editingMed ? (
                <Button variant="contained" startIcon={<SaveIcon />} onClick={updateMedication} disabled={Boolean(busy) || !displayName.trim()}>
                  {busy === 'update' ? 'Saving…' : 'Update'}
                </Button>
              ) : (
                <Button variant="contained" startIcon={<SaveIcon />} onClick={saveMedication} disabled={Boolean(busy) || !displayName.trim()}>
                  {busy === 'save' ? 'Saving…' : 'Save'}
                </Button>
              )}
              <Button variant="outlined" onClick={cancelEdit} disabled={Boolean(busy)}>Cancel</Button>
            </Stack>
          </Stack>
        </Surface>
      )}

      {/* Medications List */}
      {loadError && myMeds.length === 0 ? (
        <Alert
          severity="error"
          sx={{ mb: 3 }}
          action={<Button color="inherit" size="small" sx={{ minHeight: 44 }} onClick={loadMeds}>Try again</Button>}
        >
          Couldn&apos;t load your medications. {loadError}
        </Alert>
      ) : listLoading && myMeds.length === 0 ? null : myMeds.length === 0 ? (
        <Box sx={{ mb: 3 }}>
          <EmptyState
            icon={MedicationIcon}
            title="No medications yet"
            copy="Search for a medication above to add it to your list. You'll be able to group by time of day and export the list for your doctor."
          />
        </Box>
      ) : (
      <Surface sx={{ mb: 3 }}>
        <Box sx={{ mb: 2.5 }}>
          <SectionLabel sx={{ mb: 0.75 }}>My Medications</SectionLabel>
          <DisplayHeading size="card">Grouped by Time of Day</DisplayHeading>
        </Box>
        <Stack spacing={2}>
          {MED_GROUPS.filter(g => g.key !== 'daily' || myMeds.some(g.match)).map(({ key: slot, label, match }) => (
            <Box key={slot}>
              <SectionLabel dot sx={{ mb: 1, textTransform: 'capitalize' }}>{label}</SectionLabel>
              <Stack spacing={1} sx={{ mt: 1 }}>
                {myMeds
                  .filter(match)
                  .sort(byTypeThenName)
                  .map(m => {
                    const typeInfo = getMedTypeColor(m.med_type);

                    return (
                      <Surface
                        key={m.id ?? m._id}
                        variant="inset"
                        sx={{
                          py: 1.75,
                          px: 2,
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                          <MedicationIcon sx={{ color: typeInfo.color, fontSize: 26, mt: 0.25 }} />

                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography sx={{ fontWeight: 600, fontSize: '0.9375rem', mb: 0.25 }}>
                              {m.display_name}
                            </Typography>

                            {m.strength && (
                              <Typography
                                sx={{
                                  fontFamily: "inherit",
                                  fontSize: '0.75rem',
                                  color: 'text.secondary',
                                  mb: 0.75,
                                }}
                              >
                                {m.strength}
                              </Typography>
                            )}

                            {(m.user_indications||[]).length > 0 && (
                              <Typography
                                sx={{
                                  fontSize: '0.75rem',
                                  color: 'text.secondary',
                                  display: 'block',
                                  mb: 1,
                                }}
                              >
                                {(m.user_indications||[]).join(', ')}
                              </Typography>
                            )}

                            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
                              <Chip
                                size="small"
                                label={typeInfo.label}
                                sx={{
                                  bgcolor: typeInfo.bg,
                                  color: typeInfo.color,
                                  fontWeight: 700,
                                  fontSize: '0.75rem',
                                  letterSpacing: '0.06em',
                                  height: 20,
                                }}
                              />
                            </Box>
                          </Box>

                          <Stack direction="row" spacing={0.5}>
                            <IconButton size="small" color="primary" aria-label={`Edit ${m.display_name}`} onClick={() => startEdit(m)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" color="error" aria-label={`Remove ${m.display_name}`} onClick={() => removeMed(m)} disabled={Boolean(busy)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Stack>
                        </Box>
                      </Surface>
                    );
                  })}
                {myMeds.filter(match).length === 0 && (
                  <Typography variant="caption" color="text.secondary">No medications set for {slot}.</Typography>
                )}
              </Stack>
            </Box>
          ))}
        </Stack>
      </Surface>
      )}

    </Box>
  );
}


