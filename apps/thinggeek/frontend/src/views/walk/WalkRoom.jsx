/**
 * `/walk?at=<placeId>` — "Walk the room": a full-screen, phone-first capture
 * loop for filling in a household's inventory fast (DOCS/THINGGEEK_PLAN.md).
 * Prod's actual problem: 5 locations and 0 items. Add is built for adding ONE
 * thing carefully; Walk is built for adding TEN things in two minutes.
 *
 * Entry points: WhereView's "Walk this room" (Add here's neighbour, on the
 * drill-down and the ⋯ menu) arrives with `?at=` already set. AddThing's
 * "Walk a room…" link arrives without it — this screen then asks which
 * place, the same locations-and-containers list the "where is it?" picker
 * uses (components/WherePicker's WhereList).
 *
 * Each item: a camera button (optional) and a name (required). Sticky type
 * chips — the household's most-used first, same ordering as Add
 * (views/add/AddThing's orderTypes/TypeChips) — stay picked across items
 * until changed; the unpicked default is the household's General type.
 * "Next" creates the thing with the SAME mutation and upload path as Add
 * (hooks/useThingActions, hooks/useUploads) and resets name + photo for the
 * next one, keeping the type and the place. The photo uploads in the
 * background — capture keeps moving without waiting on it.
 *
 * A failed CREATE stays in the list as "didn't save — retry", with its name
 * and photo kept so Retry re-sends the same input; it is never silently
 * dropped. A failed PHOTO upload (the create itself succeeded) shows through
 * the shared uploads queue and retries there.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, ButtonBase, Portal, TextField, Typography, useMediaQuery, useTheme } from '@mui/material';
import { PhotoCameraOutlined as CameraIcon } from '@mui/icons-material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GeekErrorState } from '@geeksuite/ui';
import DymoTape from '../../components/DymoTape';
import { toneForKind } from '../../theme/theme';
import { statusTone } from '../../components/DueLine';
import TypeIcon from '../../components/TypeIcon';
import { PageFrame } from '../../components/PageHeader';
import { WhereList } from '../../components/WherePicker';
import { useThingActions } from '../../hooks/useThingActions';
import { useThingTree, useThingTypes } from '../../hooks/useThingMeta';
import { useUploads } from '../../hooks/useUploads';
import useKeyboardInset from '../../hooks/useKeyboardInset';
import { visuallyHidden } from '../../utils/a11y';
import { isParentKind, kindOf } from '../../utils/where';
import { TypeChips } from '../add/AddThing';

let seq = 0;

/** A place is walkable: a location or a container (never an item — see utils/where kinds). */
function isWalkablePlace(node) {
  return Boolean(node) && isParentKind(kindOf(node));
}

function CaptureThumb({ photo, onPhoto }) {
  const cameraRef = useRef(null);
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
    <Box sx={{ position: 'relative', width: 88, height: 88, flexShrink: 0 }}>
      <Box
        data-testid="walk-photo-slot"
        sx={{
          width: '100%',
          height: '100%',
          borderRadius: '6px',
          overflow: 'hidden',
          border: photo ? 1 : 2,
          borderStyle: photo ? 'solid' : 'dashed',
          borderColor: 'border',
          bgcolor: photo ? '#11100D' : 'background.paper',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {preview ? (
          <Box component="img" src={preview} alt="The photo you took" data-testid="walk-photo-preview" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <CameraIcon aria-hidden="true" sx={{ color: 'text.secondary', fontSize: 28 }} />
        )}
      </Box>
      <ButtonBase
        onClick={() => cameraRef.current?.click()}
        aria-label={photo ? 'Retake the photo' : 'Take a photo (optional)'}
        sx={{ position: 'absolute', inset: 0, borderRadius: '6px' }}
      />
      {photo ? (
        <ButtonBase
          onClick={() => onPhoto(null)}
          aria-label="Remove the photo"
          data-testid="walk-photo-remove"
          sx={{
            position: 'absolute',
            top: -8,
            right: -8,
            width: 26,
            height: 26,
            minWidth: 26,
            borderRadius: '50%',
            bgcolor: 'background.chrome',
            border: 1,
            borderColor: 'border',
            color: 'text.primary',
            fontSize: '0.875rem',
            fontWeight: 700,
            lineHeight: 1,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          ×
        </ButtonBase>
      ) : null}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden aria-hidden="true" tabIndex={-1} data-testid="walk-camera-input" onChange={picked} />
    </Box>
  );
}

function ItemStatusText({ item, upload }) {
  const theme = useTheme();
  if (item.status === 'saving') return <>Saving…</>;
  if (item.status === 'failed') return <>Didn't save — retry</>;
  if (upload?.status === 'uploading') return <>Photo uploading…</>;
  if (upload?.status === 'failed')
    return (
      <Box component="span" sx={{ color: statusTone(theme, 'overdue', theme.palette.background.paper) }}>
        Photo didn't upload — retry
      </Box>
    );
  return <>Saved</>;
}

function ItemRow({ item, upload, onRetryCreate, onRetryUpload }) {
  const theme = useTheme();
  const failed = item.status === 'failed';
  return (
    <Box
      component="li"
      data-testid="walk-item"
      data-status={item.status}
      sx={{ listStyle: 'none', display: 'flex', alignItems: 'center', gap: 1.25, minHeight: 52, py: 0.75, borderBottom: 1, borderColor: 'divider' }}
    >
      <Box sx={{ width: 40, height: 40, borderRadius: '6px', overflow: 'hidden', flexShrink: 0, bgcolor: 'plate.ground', display: 'grid', placeItems: 'center' }}>
        {item.previewUrl ? (
          <Box component="img" src={item.previewUrl} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <TypeIcon name={item.typeIcon ?? 'Inventory2'} sx={{ fontSize: 18, color: 'plate.icon' }} />
        )}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap sx={{ fontWeight: 600, fontSize: '0.9375rem' }}>
          {item.name}
        </Typography>
        <Typography noWrap sx={{ fontSize: '0.8125rem', color: failed ? statusTone(theme, 'overdue', theme.palette.background.paper) : 'text.secondary' }}>
          <ItemStatusText item={item} upload={upload} />
        </Typography>
      </Box>
      {failed ? (
        <Button size="small" onClick={() => onRetryCreate(item.key)} sx={{ minHeight: 44, color: 'text.primary' }}>
          Retry
        </Button>
      ) : null}
      {upload?.status === 'failed' ? (
        <Button size="small" onClick={() => onRetryUpload(upload.key)} sx={{ minHeight: 44, color: 'text.primary' }}>
          Retry photo
        </Button>
      ) : null}
    </Box>
  );
}

/** No `?at=`, or it doesn't name a live location/container: ask first. */
function ChooseRoom({ onPick }) {
  return (
    <PageFrame maxWidth={520}>
      <Typography variant="h1" component="h1" sx={{ fontSize: '1.375rem', mb: 0.5 }}>
        Which room are you walking?
      </Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: '0.9375rem', mb: 2 }}>Pick a place, then capture what's in it one thing at a time.</Typography>
      <Box sx={{ border: 1, borderColor: 'border', borderRadius: '6px', bgcolor: 'background.paper' }}>
        <WhereList mode="where" value={null} onPick={onPick} allowNone={false} noneLabel="" />
      </Box>
    </PageFrame>
  );
}

export default function WalkRoom() {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const at = params.get('at');
  const keyboard = useKeyboardInset();
  const nameRef = useRef(null);

  const { nodes, nodesById, loading: treeLoading, error: treeError, refetch } = useThingTree();
  const { types, loading: typesLoading } = useThingTypes();
  const { createThing } = useThingActions();
  const uploads = useUploads();

  const place = at ? nodesById.get(at) : null;
  const placeIsWalkable = isWalkablePlace(place);

  const [photo, setPhoto] = useState(null);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [typeId, setTypeId] = useState(null);
  const [items, setItems] = useState([]); // newest first: { key, name, typeId, typeIcon, photoFile, previewUrl, status, thingId, error }
  const [saving, setSaving] = useState(false);

  const generalId = useMemo(() => types.find((t) => t.key === 'general')?.id ?? null, [types]);
  const typesById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const savedCount = items.filter((it) => it.status === 'saved').length;

  const pickRoom = (id) => navigate(`/walk?at=${encodeURIComponent(id)}`, { replace: true });

  const runCreate = async (key, { itemName, itemTypeId, photoFile }) => {
    setItems((list) => list.map((it) => (it.key === key ? { ...it, status: 'saving', error: null } : it)));
    try {
      const thing = await createThing({ name: itemName, typeId: itemTypeId || generalId || null, parentId: place.id, tags: [] }, { search: '' });
      if (!thing?.id) throw new Error("That didn't save. Try again.");
      setItems((list) => list.map((it) => (it.key === key ? { ...it, status: 'saved', thingId: thing.id } : it)));
      if (photoFile) uploads.enqueue(thing.id, { file: photoFile, kind: 'photo', role: 'overview' });
    } catch (err) {
      setItems((list) => list.map((it) => (it.key === key ? { ...it, status: 'failed', error: err?.message || "That didn't save. Try again." } : it)));
    }
  };

  const next = async () => {
    if (!name.trim()) {
      setNameError('A name is needed to save it.');
      nameRef.current?.focus();
      return;
    }
    const itemName = name.trim();
    const itemTypeId = typeId;
    const photoFile = photo;
    const type = itemTypeId ? typesById.get(itemTypeId) : null;
    seq += 1;
    const key = `w${seq}`;
    let previewUrl = null;
    try {
      if (photoFile && typeof URL !== 'undefined' && URL.createObjectURL) previewUrl = URL.createObjectURL(photoFile);
    } catch {
      previewUrl = null;
    }
    setItems((list) => [{ key, name: itemName, typeId: itemTypeId, typeIcon: type?.icon, photoFile, previewUrl, status: 'saving', thingId: null, error: null }, ...list]);
    // Reset right away — the keyboard stays up and the camera is ready for the next one.
    setName('');
    setPhoto(null);
    setNameError('');
    setSaving(true);
    await runCreate(key, { itemName, itemTypeId, photoFile });
    setSaving(false);
    requestAnimationFrame(() => nameRef.current?.focus());
  };

  const retryCreate = (key) => {
    const item = items.find((it) => it.key === key);
    if (!item) return;
    runCreate(key, { itemName: item.name, itemTypeId: item.typeId, photoFile: item.photoFile });
  };

  const uploadFor = (thingId) => (thingId ? uploads.items.find((u) => u.thingId === thingId && u.kind === 'photo') : null);

  const doneWalking = () => navigate(`/where?at=${encodeURIComponent(place.id)}`);

  if (treeError && !nodes.length) {
    return (
      <PageFrame>
        <GeekErrorState title="Walk didn't load" description="The server didn't answer. Try again in a moment." onRetry={() => refetch()} sx={{ py: 6 }} />
      </PageFrame>
    );
  }
  if (!treeLoading && (!at || !placeIsWalkable)) {
    return <ChooseRoom onPick={pickRoom} />;
  }
  if (treeLoading || !place) {
    return (
      <PageFrame>
        <Typography sx={{ color: 'text.secondary', py: 4, textAlign: 'center' }}>Loading…</Typography>
      </PageFrame>
    );
  }

  const bar = (
    <Box
      data-testid="walk-next-bar"
      sx={
        isPhone
          ? {
              position: 'fixed',
              left: 0,
              right: 0,
              bottom: `${keyboard}px`,
              zIndex: theme.zIndex.appBar,
              display: 'flex',
              gap: 1,
              px: 2,
              pt: 1.25,
              pb: keyboard ? 1.25 : 'calc(10px + env(safe-area-inset-bottom))',
              bgcolor: 'background.chrome',
              borderTop: 1,
              borderColor: 'border',
            }
          : { display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2, pt: 2, borderTop: 1, borderColor: 'border' }
      }
    >
      <Button
        variant="contained"
        color="safety"
        disableElevation
        onClick={next}
        disabled={saving}
        sx={{
          fontWeight: 700,
          border: 1.5,
          borderStyle: 'solid',
          borderColor: 'safety.contrastText',
          flex: isPhone ? 1 : undefined,
          minHeight: 44,
          // Next is tapped over and over without navigating away; the
          // shared theme presses it to safety.dark, its own colour.
        }}
      >
        {saving ? 'Saving…' : 'Next'}
      </Button>
    </Box>
  );

  return (
    <PageFrame maxWidth={640} sx={{ pt: { xs: 2, md: 4 }, pb: { xs: 'calc(96px + env(safe-area-inset-bottom))', md: 8 } }}>
      <Typography variant="h1" component="h1" sx={visuallyHidden}>
        Walk {place.name}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, mb: 2.5, flexWrap: 'wrap' }}>
        <Box sx={{ minWidth: 0 }}>
          <DymoTape size="lg" tone={toneForKind(kindOf(place))}>{place.name}</DymoTape>
          <Typography data-testid="walk-count" sx={{ mt: 0.75, fontSize: '0.9375rem', color: 'text.secondary' }}>
            {savedCount} added to {place.name}
          </Typography>
        </Box>
        <Button variant="outlined" onClick={doneWalking} sx={{ color: 'text.primary', borderColor: 'border', minHeight: 44, flexShrink: 0 }}>
          Done
        </Button>
      </Box>

      <Box
        component="form"
        noValidate
        data-testid="walk-form"
        onSubmit={(e) => {
          e.preventDefault();
          next();
        }}
        sx={{ display: 'grid', gap: 1.5 }}
      >
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
          <CaptureThumb photo={photo} onPhoto={setPhoto} />
          <TextField
            inputRef={nameRef}
            autoFocus={!isPhone}
            label="Name *"
            placeholder="Rake, extension cord, tackle box"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (nameError) setNameError('');
            }}
            error={Boolean(nameError)}
            helperText={nameError || undefined}
            inputProps={{ maxLength: 200, enterKeyHint: 'next' }}
            fullWidth
          />
        </Box>
        <TypeChips types={types} loading={typesLoading} value={typeId} onPick={setTypeId} />
        {/* Enter in the name field advances (the bar's Next sits outside the form on a phone). */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </Box>
      {isPhone ? <Portal>{bar}</Portal> : bar}

      {items.length ? (
        <Box sx={{ mt: 3 }}>
          <Typography component="h2" sx={{ fontSize: '0.875rem', fontWeight: 700, color: 'text.primary', mb: 0.5 }}>
            This trip · {items.length}
          </Typography>
          <Box component="ul" sx={{ m: 0, p: 0 }}>
            {items.map((item) => (
              <ItemRow key={item.key} item={item} upload={uploadFor(item.thingId)} onRetryCreate={retryCreate} onRetryUpload={uploads.retry} />
            ))}
          </Box>
        </Box>
      ) : null}
    </PageFrame>
  );
}
