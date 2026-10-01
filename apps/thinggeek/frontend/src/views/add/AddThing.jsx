/**
 * `/add` — "Add a thing", on ONE screen
 * (since 2026-09-29; it was a three-step wizard that offered Skip twice):
 *
 *   photo slot    camera (back lens) or a file; optional, so there is no
 *                 Skip. Once there's a photo, say what it shows (overview /
 *                 ID plate / receipt).
 *   name          a name you'd say out loud.
 *   type          chips, the household's most-used types first, then
 *                 "More types" for the rest.
 *   where         the place picker, defaulting to the last place you added
 *                 something (or the one "Add here" came from).
 *   Save          lands on the new thing's page.
 *   Save & add    stays here with the same place and type, the photo and
 *   another       name cleared, the name field focused — for walking a
 *                 shelf.
 *
 * Phone first: the Save bar is fixed to the bottom and rides ABOVE the
 * on-screen keyboard (hooks/useKeyboardInset.js), so typing a name never
 * hides Save. The tab bar steps aside on this screen (navConfig
 * hidesTabBar). md+: the same form in a column, the bar at its foot.
 *
 * Create → the thing is made and the photo uploads onto it in the
 * background (hooks/useUploads.jsx — it keeps going whatever you do next,
 * and a failure offers Retry on the thing's page).
 *
 * Storage Yard: the photo slot is an open unit — the black steel frame, the
 * orange roll-up door pulled up into its housing, the dim inside lit from
 * the top, the camera in it; the Save bar is the black livery bar with the
 * orange Save.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, CircularProgress, Portal, TextField, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery, useTheme } from '@mui/material';
import { CloseRounded as RemoveIcon, ExpandMore as MoreIcon, FolderOpenOutlined as FileIcon, PhotoCameraOutlined as CameraIcon } from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useToast } from '@geeksuite/ui';
import WherePicker from '../../components/WherePicker';
import RoleChips from '../../components/RoleChips';
import TagInput from '../../components/TagInput';
import TypeIcon from '../../components/TypeIcon';
import { PageFrame } from '../../components/PageHeader';
import { thingPath } from '../../components/navConfig';
import { useThingActions } from '../../hooks/useThingActions';
import { useThingTree, useThingTypes } from '../../hooks/useThingMeta';
import { useUploads } from '../../hooks/useUploads';
import useKeyboardInset from '../../hooks/useKeyboardInset';
import ChromeTheme from '../../components/Chrome';
import { CHROME, DISPLAY_FONT, LIVERY, STENCIL_FONT } from '../../theme/theme';
import { chipGroupSx } from '../../theme/chipStyles';
import { photoRoleLabel } from '../../utils/vocab';
import { buildAttributes } from '../../utils/attributes';
import { hasValue } from '../../utils/identifiers';
import { readPref, writePref } from '../../utils/storage';
import { goBack } from '../../utils/goBack';
import { visuallyHidden } from '../../utils/a11y';
import AttributeField from '../edit/AttributeField';
import { PHOTO_ACCEPT } from '../detail/AddFileSheet';

const ADD_ROLES = ['overview', 'id-plate', 'receipt'];
export const LAST_PLACE_KEY = 'thinggeek.lastPlace';
/** How many types show before "More types". */
export const TOP_TYPES = 6;

const labelSx = { fontSize: '0.9375rem', fontWeight: 700, color: 'text.primary', mb: 1 };

/**
 * The type chips' order: most-used first (by how many things the household
 * has of each), then the rest in their own order; General and locations go
 * last (the fallback, and not what "Add a thing" is usually for).
 */
export function orderTypes(types = []) {
  const rank = (t) => (t.key === 'general' ? 2 : t.kind === 'location' ? 3 : 0);
  return types
    .map((t, i) => ({ t, i }))
    .sort((a, b) => rank(a.t) - rank(b.t) || (b.t.thingCount ?? 0) - (a.t.thingCount ?? 0) || a.i - b.i)
    .map(({ t }) => t);
}

export function PhotoSlot({ photo, onPhoto, role, onRole }) {
  const cameraRef = useRef(null);
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!photo || typeof URL === 'undefined' || !URL.createObjectURL) {
      setPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL?.(url);
  }, [photo]);

  const picked = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onPhoto(file);
  };

  return (
    <Box component="section" aria-label="Photo">
      {/* An open unit: the steel frame, the roll-up door pulled up into its housing, the dim inside. */}
      <Box
        sx={{
          position: 'relative',
          p: '6px',
          pt: '20px',
          borderRadius: '3px',
          bgcolor: 'unit.frame',
          backgroundImage: (t) =>
            `repeating-linear-gradient(180deg, ${t.palette.unit.ridge} 0 2px, ${t.palette.unit.door} 2px 5px, ${t.palette.unit.groove} 5px 6px)`,
          backgroundSize: 'calc(100% - 12px) 12px',
          backgroundPosition: '6px 4px',
          backgroundRepeat: 'no-repeat',
          boxShadow: (t) => (t.palette.mode === 'dark' ? '0 3px 0 rgba(0,0,0,0.6)' : '0 3px 0 rgba(60,38,14,0.25)'),
        }}
      >
        <ChromeTheme>
          <Box
            data-testid="add-photo-slot"
            sx={{
              position: 'relative',
              height: { xs: 168, sm: 220 },
              width: '100%',
              borderRadius: '2px',
              overflow: 'hidden',
              bgcolor: photo ? '#0B0A09' : 'box.hole',
              backgroundImage: photo ? 'none' : 'radial-gradient(ellipse 80% 70% at 50% 0, rgba(255, 210, 138, 0.14), transparent 100%)',
              boxShadow: 'inset 0 6px 14px rgba(0,0,0,0.6)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            {preview ? (
              <Box component="img" src={preview} alt="The photo you chose" data-testid="add-photo-preview" sx={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : photo ? (
              <Typography sx={{ color: 'text.primary', fontSize: '0.875rem' }}>{photo.name}</Typography>
            ) : (
              <Box sx={{ display: 'grid', justifyItems: 'center', gap: 1.25, px: 2, textAlign: 'center' }}>
                <Box
                  component="span"
                  aria-hidden="true"
                  data-caption="PHOTO GOES IN HERE"
                  sx={{ color: LIVERY.orange, fontFamily: STENCIL_FONT, fontSize: '0.75rem', letterSpacing: '0.14em', '&::before': { content: 'attr(data-caption)' } }}
                />
                <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>A photo is optional — the whole thing, in good light.</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 1 }}>
                  <Button
                    variant="contained"
                    color="hero"
                    disableElevation
                    startIcon={<CameraIcon />}
                    onClick={() => cameraRef.current?.click()}
                    sx={{ fontWeight: 800, border: 2, borderStyle: 'solid', borderColor: 'hero.contrastText' }}
                  >
                    Take a photo
                  </Button>
                  <Button variant="outlined" startIcon={<FileIcon />} onClick={() => fileRef.current?.click()} sx={{ color: 'text.primary', borderColor: 'text.secondary' }}>
                    Choose a file
                  </Button>
                </Box>
              </Box>
            )}
            {photo ? (
              <Box sx={{ position: 'absolute', right: 8, bottom: 8, display: 'flex', gap: 1 }}>
                <Button size="small" variant="contained" startIcon={<CameraIcon />} onClick={() => cameraRef.current?.click()} sx={{ minHeight: 44 }}>
                  Retake
                </Button>
                <Button size="small" variant="contained" startIcon={<RemoveIcon />} onClick={() => onPhoto(null)} sx={{ minHeight: 44 }}>
                  Remove
                </Button>
              </Box>
            ) : null}
          </Box>
        </ChromeTheme>
      </Box>
      {photo ? (
        <Box sx={{ mt: 1.5 }}>
          <Typography component="h2" sx={labelSx}>
            This photo shows
          </Typography>
          <RoleChips roles={ADD_ROLES} value={role} onChange={onRole} label="Photo role" labelFor={photoRoleLabel} />
        </Box>
      ) : null}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden aria-hidden="true" tabIndex={-1} data-testid="add-camera-input" onChange={picked} />
      <input ref={fileRef} type="file" accept={PHOTO_ACCEPT} hidden aria-hidden="true" tabIndex={-1} data-testid="add-file-input" onChange={picked} />
    </Box>
  );
}

export function TypeChips({ types, loading, value, onPick }) {
  const [all, setAll] = useState(false);
  const ordered = useMemo(() => orderTypes(types), [types]);
  const top = ordered.slice(0, TOP_TYPES);
  // The chosen type always shows, even if it came from "More types".
  const shown = all ? ordered : top.some((t) => t.id === value) || !value ? top : [...top, ordered.find((t) => t.id === value)].filter(Boolean);
  const hidden = ordered.length - shown.length;

  if (loading && !types.length) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', py: 2 }}>
        <CircularProgress size={22} aria-label="Loading types" />
      </Box>
    );
  }
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
      <ToggleButtonGroup
        exclusive
        value={value}
        onChange={(_e, v) => onPick(v)}
        aria-label="Type"
        data-testid="type-chips"
        sx={{ ...chipGroupSx, '& .MuiToggleButton-root': { ...chipGroupSx['& .MuiToggleButton-root'], gap: 0.75, pl: 1.25 } }}
      >
        {shown.map((t) => (
          <ToggleButton key={t.id} value={t.id} data-testid="type-chip">
            <TypeIcon name={t.icon} sx={{ fontSize: 18 }} />
            {t.name}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      {hidden > 0 ? (
        <Button onClick={() => setAll(true)} endIcon={<MoreIcon />} sx={{ color: 'text.primary', minHeight: 44, borderRadius: '999px', px: 1.75 }}>
          More types
        </Button>
      ) : null}
    </Box>
  );
}

export default function AddThing() {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();
  const location = useLocation();
  const { notify } = useToast();
  const { types, typesById, loading } = useThingTypes();
  const { nodesById } = useThingTree();
  const { createThing } = useThingActions();
  const { enqueue } = useUploads();
  const keyboard = useKeyboardInset();
  const nameRef = useRef(null);

  const fromHere = location.state?.parentId ?? null;
  const [photo, setPhoto] = useState(null);
  const [role, setRole] = useState('overview');
  const [typeId, setTypeId] = useState(null);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState(() => fromHere ?? readPref(LAST_PLACE_KEY, null));
  const [tags, setTags] = useState([]);
  const [busy, setBusy] = useState(null); // 'save' | 'again' | null
  const [nameError, setNameError] = useState('');
  const [attrs, setAttrs] = useState({});
  const [attrErrors, setAttrErrors] = useState({});

  // A remembered place that has since gone (trashed, purged) is not a default.
  useEffect(() => {
    if (parentId && !fromHere && nodesById.size && !nodesById.has(parentId)) setParentId(null);
  }, [parentId, fromHere, nodesById]);

  const type = typeId ? typesById.get(typeId) : null;
  const generalId = useMemo(() => types.find((t) => t.key === 'general')?.id ?? null, [types]);
  const required = (type?.fields ?? []).filter((f) => f.required);

  const save = async (again) => {
    const missingRequired = Object.fromEntries(required.filter((f) => !hasValue(attrs[f.key]) && attrs[f.key] !== false).map((f) => [f.key, `${f.label} is required for this type.`]));
    setAttrErrors(missingRequired);
    if (!name.trim()) {
      setNameError('A thing needs a name.');
      nameRef.current?.focus();
      return;
    }
    if (Object.keys(missingRequired).length) return;
    setBusy(again ? 'again' : 'save');
    try {
      const input = { name: name.trim(), typeId: typeId || generalId || null, parentId: parentId || null, tags };
      if (required.length) input.attributes = buildAttributes(required, attrs);
      const thing = await createThing(input, { search: location.search });
      if (!thing?.id) throw new Error("That didn't save. Try again.");
      if (photo) enqueue(thing.id, { file: photo, kind: 'photo', role });
      writePref(LAST_PLACE_KEY, parentId || null);
      if (again) {
        notify(photo ? `${thing.name} added — the photo is uploading. Next one.` : `${thing.name} added. Next one.`, { tone: 'success' });
        setName('');
        setPhoto(null);
        setRole('overview');
        setAttrs({});
        setBusy(null);
        requestAnimationFrame(() => nameRef.current?.focus());
      } else {
        notify(photo ? `${thing.name} added — the photo is uploading.` : `${thing.name} added.`, { tone: 'success' });
        navigate(thingPath(thing.id, location.search), { replace: true });
      }
    } catch (err) {
      notify(err?.message || "That didn't save. Try again.", { tone: 'error' });
      setBusy(null);
    }
  };

  const bar = (
    <Box
      data-testid="add-save-bar"
      sx={
        isPhone
          ? {
              position: 'fixed',
              left: 0,
              right: 0,
              bottom: `${keyboard}px`,
              zIndex: theme.zIndex.appBar,
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
              gap: 1,
              px: 2,
              pb: keyboard ? 1.25 : 'calc(10px + env(safe-area-inset-bottom))',
              bgcolor: CHROME.bar,
              // the livery: the orange stripe along the top
              backgroundImage: `linear-gradient(180deg, ${LIVERY.orange} 0 4px, transparent 4px)`,
              pt: '14px',
            }
          : { display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 3, pt: 2, borderTop: '3px solid', borderColor: 'rule.main' }
      }
    >
      {!isPhone ? (
        <Button onClick={() => goBack(navigate, location)} sx={{ color: 'text.secondary', mr: 'auto' }}>
          Cancel
        </Button>
      ) : null}
      <Button variant="outlined" onClick={() => save(true)} disabled={Boolean(busy)} sx={{ color: 'text.primary', borderColor: 'text.primary', fontWeight: 700 }}>
        {busy === 'again' ? 'Saving…' : 'Save & add another'}
      </Button>
      <Button
        variant="contained"
        color="hero"
        disableElevation
        onClick={() => save(false)}
        disabled={Boolean(busy)}
        sx={{ fontWeight: 800, border: 2, borderStyle: 'solid', borderColor: 'hero.contrastText' }}
      >
        {busy === 'save' ? 'Saving…' : 'Save'}
      </Button>
    </Box>
  );

  return (
    <PageFrame maxWidth={680} sx={{ pt: { xs: 2, md: 4 }, pb: { xs: 'calc(96px + env(safe-area-inset-bottom))', md: 8 } }}>
      <Typography variant="h1" component="h1" sx={isPhone ? visuallyHidden : { fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontSize: '2.25rem', mb: 2.5 }}>
        Add a thing
      </Typography>
      <Box
        component="form"
        noValidate
        data-testid="add-form"
        onSubmit={(e) => {
          e.preventDefault();
          save(false);
        }}
        sx={{ display: 'grid', gap: 2.5 }}
      >
        <PhotoSlot photo={photo} onPhoto={setPhoto} role={role} onRole={setRole} />

        <TextField
          inputRef={nameRef}
          autoFocus={!isPhone}
          label="Name *"
          placeholder="Wendy, the Ruger, Dad's table saw"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (nameError) setNameError('');
          }}
          error={Boolean(nameError)}
          helperText={nameError || undefined}
          inputProps={{ maxLength: 200, enterKeyHint: 'done' }}
          fullWidth
        />

        <Box component="section" aria-labelledby="add-type-label">
          <Typography id="add-type-label" component="h2" sx={labelSx}>
            What is it?
          </Typography>
          <TypeChips types={types} loading={loading} value={typeId} onPick={setTypeId} />
        </Box>

        {required.length ? (
          <Box sx={{ display: 'grid', gap: 2 }}>
            {required.map((f) => (
              <AttributeField key={f.key} field={f} value={attrs[f.key]} onChange={(v) => setAttrs((a) => ({ ...a, [f.key]: v }))} error={attrErrors[f.key]} />
            ))}
          </Box>
        ) : null}

        <WherePicker value={parentId} onChange={setParentId} />
        <Button onClick={() => navigate('/walk')} startIcon={<CameraIcon />} sx={{ color: 'text.secondary', justifyContent: 'flex-start', minHeight: 44, justifySelf: 'start', px: 0.5 }}>
          Walk a whole room…
        </Button>
        <TagInput value={tags} onChange={setTags} />
        {/* Enter in the name field saves (the bar's Save is outside the form on a phone). */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </Box>
      {isPhone ? (
        <Portal>
          <ChromeTheme>{bar}</ChromeTheme>
        </Portal>
      ) : (
        bar
      )}
    </PageFrame>
  );
}
