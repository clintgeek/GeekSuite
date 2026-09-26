/**
 * `/add` — adding a thing, phone-first, in three steps:
 *
 *   1. Photo   the camera opens on the back lens (capture="environment");
 *              say what the photo shows (overview / ID plate / receipt).
 *              Optional — "Skip, no photo yet".
 *   2. Type    a grid of the household's types (the starter types to begin).
 *   3. Name    + where it is (locations and containers only, with a new
 *              location made inline) + tags. "Add here" on a thing page or
 *              the Where page arrives with it already chosen
 *              (location.state.parentId).
 *
 * Create → the thing is made, the sheet lands on its page, and the photo
 * uploads there with a progress bar (hooks/useUploads.jsx — it keeps going
 * whatever the person does next, and a failure offers Retry on the page).
 * Details can be filled in later; that's the point.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, ButtonBase, CircularProgress, TextField, Typography } from '@mui/material';
import {
  ArrowBack as BackIcon,
  CheckCircle as SelectedIcon,
  FolderOpenOutlined as FileIcon,
  PhotoCameraOutlined as CameraIcon,
} from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import { GeekDialog, useToast } from '@geeksuite/ui';
import WherePicker from '../../components/WherePicker';
import RoleChips from '../../components/RoleChips';
import TagInput from '../../components/TagInput';
import TypeIcon from '../../components/TypeIcon';
import { libraryPath, thingPath } from '../../components/navConfig';
import { useThingActions } from '../../hooks/useThingActions';
import { useThingTypes } from '../../hooks/useThingMeta';
import { useUploads } from '../../hooks/useUploads';
import { DISPLAY_FONT } from '../../theme/theme';
import { photoRoleLabel } from '../../utils/vocab';
import { buildAttributes } from '../../utils/attributes';
import { hasValue } from '../../utils/identifiers';
import AttributeField from '../edit/AttributeField';
import { PHOTO_ACCEPT } from '../detail/AddFileSheet';

const STEPS = ['Photo', 'Type', 'Name & where'];
const ADD_ROLES = ['overview', 'id-plate', 'receipt'];

function StepHeader({ step }) {
  return (
    <Box component="ol" aria-label="Steps" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', gap: 0.75, mb: 2.5 }}>
      {STEPS.map((s, i) => {
        const state = i < step ? 'done' : i === step ? 'current' : 'todo';
        return (
          <Box
            component="li"
            key={s}
            aria-current={state === 'current' ? 'step' : undefined}
            sx={{ flex: 1, minWidth: 0 }}
          >
            <Box sx={{ height: 4, borderRadius: 2, bgcolor: state === 'todo' ? 'divider' : 'primary.main', mb: 0.75 }} />
            <Typography noWrap sx={{ fontSize: '0.75rem', fontWeight: state === 'current' ? 700 : 500, color: state === 'current' ? 'text.primary' : 'text.secondary' }}>
              {i + 1}. {s}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

function StepTitle({ children, lede }) {
  return (
    <Box sx={{ mb: 2 }}>
      <Typography component="h3" sx={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: '1.375rem', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
        {children}
      </Typography>
      {lede ? <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', mt: 0.5 }}>{lede}</Typography> : null}
    </Box>
  );
}

export function PhotoStep({ photo, onPhoto, role, onRole }) {
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
    <>
      <StepTitle lede="Start with a photo — it's the first thing an insurer asks for. You can skip it and add one later.">Take a photo</StepTitle>
      <Box
        sx={{
          position: 'relative',
          aspectRatio: '4 / 3',
          maxHeight: 340,
          width: '100%',
          borderRadius: 3,
          overflow: 'hidden',
          border: photo ? 0 : 2,
          borderStyle: 'dashed',
          borderColor: 'border',
          bgcolor: photo ? '#11100D' : 'background.raised',
          display: 'grid',
          placeItems: 'center',
          mb: 2,
        }}
      >
        {preview ? (
          <Box component="img" src={preview} alt="The photo you chose" data-testid="add-photo-preview" sx={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : photo ? (
          <Typography sx={{ color: '#F5F1E8', fontSize: '0.875rem' }}>{photo.name}</Typography>
        ) : (
          <Box sx={{ textAlign: 'center', px: 2 }}>
            <CameraIcon aria-hidden="true" sx={{ fontSize: 44, color: 'text.secondary', mb: 1 }} />
            <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>The whole thing, in good light.</Typography>
          </Box>
        )}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 2.5 }}>
        <Button variant="contained" startIcon={<CameraIcon />} onClick={() => cameraRef.current?.click()}>
          {photo ? 'Retake' : 'Take a photo'}
        </Button>
        <Button variant="outlined" startIcon={<FileIcon />} onClick={() => fileRef.current?.click()} sx={{ color: 'text.primary' }}>
          Choose a file
        </Button>
      </Box>
      <Typography component="h4" sx={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary', mb: 1 }}>
        This photo shows
      </Typography>
      <RoleChips roles={ADD_ROLES} value={role} onChange={onRole} label="Photo role" labelFor={photoRoleLabel} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden aria-hidden="true" tabIndex={-1} data-testid="add-camera-input" onChange={picked} />
      <input ref={fileRef} type="file" accept={PHOTO_ACCEPT} hidden aria-hidden="true" tabIndex={-1} data-testid="add-file-input" onChange={picked} />
    </>
  );
}

export function TypeStep({ types, loading, value, onPick }) {
  return (
    <>
      <StepTitle lede="Each type asks only for what matters to it. You can edit types, or make your own, under Types.">What is it?</StepTitle>
      {loading && !types.length ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
          <CircularProgress size={24} aria-label="Loading types" />
        </Box>
      ) : (
        <Box role="radiogroup" aria-label="Type" sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1 }}>
          {types.map((t) => {
            const selected = value === t.id;
            const masked = t.fields.filter((f) => f.identifier).length;
            return (
              <ButtonBase
                key={t.id}
                role="radio"
                aria-checked={selected ? 'true' : 'false'}
                onClick={() => onPick(t.id)}
                data-testid="type-card"
                sx={{
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 0.75,
                  p: 1.5,
                  minHeight: 96,
                  borderRadius: 2.5,
                  border: selected ? 2 : 1,
                  borderColor: selected ? 'primary.main' : 'divider',
                  bgcolor: selected ? 'action.selected' : 'background.card',
                  textAlign: 'left',
                  '&:hover': { borderColor: 'primary.main' },
                }}
              >
                <Box sx={{ width: 36, height: 36, borderRadius: '10px', display: 'grid', placeItems: 'center', bgcolor: 'plate.ground', color: 'plate.icon' }}>
                  <TypeIcon name={t.icon} sx={{ fontSize: 22 }} />
                </Box>
                <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem', color: 'text.primary' }}>{t.name}</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', lineHeight: 1.35 }}>
                  {t.fields.length ? `${t.fields.length} field${t.fields.length === 1 ? '' : 's'}${masked ? ` · ${masked} masked` : ''}` : 'Just the basics'}
                </Typography>
                {selected ? <SelectedIcon aria-hidden="true" sx={{ position: 'absolute', top: 10, right: 10, fontSize: 20, color: 'primary.main' }} /> : null}
              </ButtonBase>
            );
          })}
        </Box>
      )}
    </>
  );
}

export function NameStep({ type, name, onName, parentId, onParent, tags, onTags, error, attrs = {}, onAttr, attrErrors = {} }) {
  const required = (type?.fields ?? []).filter((f) => f.required);
  return (
    <>
      <StepTitle lede="A name you'd say out loud — “Wendy”, “the Ruger”, “Dad's table saw”.">{type ? `Name this ${type.name.toLowerCase()}` : 'Name it'}</StepTitle>
      <Box sx={{ display: 'grid', gap: 2 }}>
        <TextField
          autoFocus
          label="Name *"
          value={name}
          onChange={(e) => onName(e.target.value)}
          error={Boolean(error)}
          helperText={error || undefined}
          inputProps={{ maxLength: 200 }}
          fullWidth
        />
        {required.map((f) => (
          <AttributeField key={f.key} field={f} value={attrs[f.key]} onChange={(v) => onAttr(f.key, v)} error={attrErrors[f.key]} />
        ))}
        <WherePicker value={parentId} onChange={onParent} />
        <TagInput value={tags} onChange={onTags} />
      </Box>
    </>
  );
}

export default function AddThing() {
  const navigate = useNavigate();
  const location = useLocation();
  const { notify } = useToast();
  const { types, typesById, loading } = useThingTypes();
  const { createThing } = useThingActions();
  const { enqueue } = useUploads();
  const [step, setStep] = useState(0);
  const [photo, setPhoto] = useState(null);
  const [role, setRole] = useState('overview');
  const [typeId, setTypeId] = useState(null);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState(() => location.state?.parentId ?? null);
  const [tags, setTags] = useState([]);
  const [busy, setBusy] = useState(false);
  const [nameError, setNameError] = useState('');
  const [attrs, setAttrs] = useState({});
  const [attrErrors, setAttrErrors] = useState({});

  const type = typeId ? typesById.get(typeId) : null;
  const close = () => navigate(libraryPath(location.search));
  const sortedTypes = useMemo(() => {
    // General last: it's the fallback, not a first choice.
    const list = [...types];
    list.sort((a, b) => (a.key === 'general') - (b.key === 'general'));
    return list;
  }, [types]);

  const create = async () => {
    // A type's required fields are asked for here (the gateway enforces them on create).
    const required = (type?.fields ?? []).filter((f) => f.required);
    const missingRequired = Object.fromEntries(required.filter((f) => !hasValue(attrs[f.key]) && attrs[f.key] !== false).map((f) => [f.key, `${f.label} is required for this type.`]));
    setAttrErrors(missingRequired);
    if (!name.trim()) {
      setNameError('A thing needs a name.');
      return;
    }
    if (Object.keys(missingRequired).length) return;
    setBusy(true);
    try {
      const input = { name: name.trim(), typeId: typeId || null, parentId: parentId || null, tags };
      if (required.length) input.attributes = buildAttributes(required, attrs);
      const thing = await createThing(input, { search: location.search });
      if (!thing?.id) throw new Error("That didn't save. Try again.");
      if (photo) enqueue(thing.id, { file: photo, kind: 'photo', role });
      notify(photo ? `${thing.name} added — the photo is uploading.` : `${thing.name} added.`, { tone: 'success' });
      navigate(thingPath(thing.id, location.search), { replace: true });
    } catch (err) {
      notify(err?.message || "That didn't save. Try again.", { tone: 'error' });
      setBusy(false);
    }
  };

  let primary;
  if (step === 0) {
    primary = (
      <Button variant="contained" onClick={() => setStep(1)}>
        {photo ? 'Next' : 'Skip'}
      </Button>
    );
  } else if (step === 1) {
    primary = (
      <Button variant="contained" disabled={!typeId} onClick={() => setStep(2)}>
        Next
      </Button>
    );
  } else {
    primary = (
      <Button variant="contained" onClick={create} disabled={busy}>
        {busy ? 'Creating…' : 'Create'}
      </Button>
    );
  }

  return (
    <GeekDialog
      open
      onClose={close}
      title="Add a thing"
      maxWidth="sm"
      primaryAction={primary}
      secondaryAction={
        <Button onClick={close} sx={{ color: 'text.secondary' }}>
          Cancel
        </Button>
      }
      bodySx={{ pt: 2.5 }}
    >
      <Box data-testid={`add-step-${step}`}>
        <StepHeader step={step} />
        {step > 0 ? (
          <Button size="small" startIcon={<BackIcon />} onClick={() => setStep(step - 1)} sx={{ color: 'text.secondary', ml: -1, mb: 1 }}>
            Back to {STEPS[step - 1].toLowerCase()}
          </Button>
        ) : null}
        {step === 0 ? (
          <>
            <PhotoStep photo={photo} onPhoto={setPhoto} role={role} onRole={setRole} />
            {!photo ? (
              <Button fullWidth onClick={() => setStep(1)} sx={{ mt: 2, color: 'text.primary' }}>
                Skip — no photo yet
              </Button>
            ) : null}
          </>
        ) : null}
        {step === 1 ? (
          <TypeStep
            types={sortedTypes}
            loading={loading}
            value={typeId}
            onPick={(id) => {
              setTypeId(id);
              setStep(2);
            }}
          />
        ) : null}
        {step === 2 ? (
          <NameStep
            type={type}
            name={name}
            onName={(v) => {
              setName(v);
              if (nameError) setNameError('');
            }}
            parentId={parentId}
            onParent={setParentId}
            tags={tags}
            onTags={setTags}
            error={nameError}
            attrs={attrs}
            onAttr={(key, v) => setAttrs((a) => ({ ...a, [key]: v }))}
            attrErrors={attrErrors}
          />
        ) : null}
      </Box>
    </GeekDialog>
  );
}
