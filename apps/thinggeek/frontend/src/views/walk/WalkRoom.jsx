/**
 * `/walk?at=<placeId>` — "Pack a room" (Moving Day's name for what was "Walk
 * the room"; the route stays /walk): a full-screen, phone-first capture
 * loop for filling in a household's inventory fast (DOCS/THINGGEEK_PLAN.md).
 * It looks the part: the room's open box with its moving label on the
 * front, a running "N packed into Garage", and the orange Next on the
 * dock's black edge.
 * Prod's actual problem: 5 locations and 0 items. Add is built for adding ONE
 * thing carefully; Walk is built for adding TEN things in two minutes.
 *
 * Entry points: WhereView's "Pack this room" (Add here's neighbour, on the
 * drill-down and the ⋯ menu) arrives with `?at=` already set. AddThing's
 * "Pack a whole room…" link arrives without it — this screen then asks which
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
 * Required fields (a household can mark a custom field required; no starter
 * type has one): when the picked type — or General, the unpicked default —
 * has any, they show inline under the type chips and Next is disabled, with
 * the reason beside it, until they're filled. Their values go with the
 * create and reset with the name. A type with none looks exactly as before.
 *
 * A failed CREATE stays in the list as "didn't save — retry", with its name
 * and photo kept so Retry re-sends the same input; it is never silently
 * dropped. When the server rejects it for a field (it became required since
 * the types loaded), the row says which, shows that field in place, and its
 * Save re-sends with the value; the types are re-read so the capture row
 * asks for it from then on. A failed PHOTO upload (the create itself
 * succeeded) shows through the shared uploads queue and retries there.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, ButtonBase, Portal, TextField, Typography, useMediaQuery, useTheme } from '@mui/material';
import { PhotoCameraOutlined as CameraIcon } from '@mui/icons-material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GeekErrorState } from '@geeksuite/ui';
import ChromeTheme from '../../components/Chrome';
import MovingBox from '../../components/MovingBox';
import MovingLabel from '../../components/MovingLabel';
import { statusTone } from '../../components/DueLine';
import { CHROME, LIVERY, dustImage } from '../../theme/theme';
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
import AttributeField from '../edit/AttributeField';
import { attributeErrorsFrom, buildAttributes, fieldList, missingRequired } from '../../utils/attributes';

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
          borderRadius: '3px',
          overflow: 'hidden',
          // a little open box: cardboard flaps round a dark inside
          border: '6px solid',
          borderColor: 'box.flap',
          bgcolor: photo ? '#0B0A09' : 'box.hole',
          boxShadow: 'inset 0 4px 8px rgba(0,0,0,0.6), 0 2px 0 rgba(0,0,0,0.25)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {preview ? (
          <Box component="img" src={preview} alt="The photo you took" data-testid="walk-photo-preview" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <CameraIcon aria-hidden="true" sx={{ color: LIVERY.orange, fontSize: 30 }} />
        )}
      </Box>
      <ButtonBase
        onClick={() => cameraRef.current?.click()}
        aria-label={photo ? 'Retake the photo' : 'Take a photo (optional)'}
        sx={{ position: 'absolute', inset: 0, borderRadius: '3px' }}
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
            bgcolor: 'background.paper',
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
  if (item.status === 'needs') return <>Needs {fieldList(item.fix.map((x) => x.field))} to save</>;
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

/**
 * The server said no for a field this screen didn't know was required: that
 * field, in place, and a Save that re-sends the item with it.
 */
function FixFields({ item, statusId, onFix }) {
  const [values, setValues] = useState({});
  const fields = item.fix.map((x) => ({ ...x.field, required: true }));
  const unfilled = missingRequired(fields, values);
  return (
    <Box
      component="form"
      noValidate
      data-testid="walk-item-fix"
      onSubmit={(e) => {
        e.preventDefault();
        if (!unfilled.length) onFix(item.key, fields, values);
      }}
      sx={{ display: 'grid', gap: 1, pl: { xs: 0, sm: '52px' }, pb: 1.5 }}
    >
      {fields.map((field) => (
        <AttributeField
          key={field.key}
          idPrefix={`walk-${item.key}`}
          field={field}
          value={values[field.key]}
          onChange={(v) => setValues((cur) => ({ ...cur, [field.key]: v }))}
        />
      ))}
      <Button
        type="submit"
        variant="outlined"
        disabled={unfilled.length > 0}
        aria-describedby={statusId}
        sx={{ justifySelf: 'start', minHeight: 44, color: 'text.primary', borderColor: 'text.primary' }}
      >
        Save {item.name}
      </Button>
    </Box>
  );
}

function ItemRow({ item, upload, onRetryCreate, onRetryUpload, onFix }) {
  const theme = useTheme();
  const failed = item.status === 'failed' || item.status === 'needs';
  const statusId = `walk-status-${item.key}`;
  return (
    <Box component="li" data-testid="walk-item" data-status={item.status} sx={{ listStyle: 'none', borderBottom: 1, borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minHeight: 52, py: 0.75 }}>
        <Box sx={{ width: 40, height: 40, borderRadius: '2px', overflow: 'hidden', flexShrink: 0, bgcolor: 'box.face', display: 'grid', placeItems: 'center', backgroundImage: `linear-gradient(180deg, transparent 0 62%, ${LIVERY.orange} 62% 80%, transparent 80%)` }}>
          {item.previewUrl ? (
            <Box component="img" src={item.previewUrl} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <TypeIcon name={item.typeIcon ?? 'Inventory2'} sx={{ fontSize: 18, color: 'box.print', mb: '8px' }} />
          )}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 600, fontSize: '0.9375rem' }}>
            {item.name}
          </Typography>
          <Typography id={statusId} sx={{ fontSize: '0.8125rem', color: failed ? statusTone(theme, 'overdue', theme.palette.background.paper) : 'text.secondary' }}>
            <ItemStatusText item={item} upload={upload} />
          </Typography>
        </Box>
        {item.status === 'failed' ? (
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
      {item.status === 'needs' ? <FixFields item={item} statusId={statusId} onFix={onFix} /> : null}
    </Box>
  );
}

/** No `?at=`, or it doesn't name a live location/container: ask first. */
function ChooseRoom({ onPick }) {
  return (
    <PageFrame maxWidth={520}>
      <Typography variant="h1" component="h1" sx={{ fontSize: '1.625rem', mb: 0.5 }}>
        Which room are you packing?
      </Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: '0.9375rem', mb: 2 }}>Pick a place, then capture what's in it one thing at a time.</Typography>
      <Box sx={{ border: 1, borderColor: 'border', borderTop: '4px solid', borderTopColor: 'rule.main', borderRadius: '3px', bgcolor: 'background.paper' }}>
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
  const { types, loading: typesLoading, refetch: refetchTypes } = useThingTypes();
  const { createThing } = useThingActions();
  const uploads = useUploads();

  const place = at ? nodesById.get(at) : null;
  const placeIsWalkable = isWalkablePlace(place);

  const [photo, setPhoto] = useState(null);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [attrs, setAttrs] = useState({});
  const [attrErrors, setAttrErrors] = useState({});
  const [typeId, setTypeId] = useState(null);
  const [items, setItems] = useState([]); // newest first: { key, name, typeId, typeIcon, photoFile, previewUrl, status, thingId, error }
  const [saving, setSaving] = useState(false);

  const generalId = useMemo(() => types.find((t) => t.key === 'general')?.id ?? null, [types]);
  const typesById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const savedCount = items.filter((it) => it.status === 'saved').length;

  // The type this item will be created as (unpicked = General) and what it insists on.
  const effectiveType = typesById.get(typeId || generalId) ?? null;
  const required = (effectiveType?.fields ?? []).filter((f) => f.required);
  const unfilled = missingRequired(required, attrs);
  const blockedReason = unfilled.length ? `Fill in ${fieldList(unfilled)} to save.` : '';

  const pickRoom = (id) => navigate(`/walk?at=${encodeURIComponent(id)}`, { replace: true });

  const runCreate = async (key, { itemName, itemTypeId, photoFile, attributes }) => {
    setItems((list) => list.map((it) => (it.key === key ? { ...it, attributes, status: 'saving', error: null, fix: null } : it)));
    const resolvedTypeId = itemTypeId || generalId || null;
    try {
      const input = { name: itemName, typeId: resolvedTypeId, parentId: place.id, tags: [] };
      if (attributes && Object.keys(attributes).length) input.attributes = attributes;
      const thing = await createThing(input, { search: '' });
      if (!thing?.id) throw new Error("That didn't save. Try again.");
      setItems((list) => list.map((it) => (it.key === key ? { ...it, status: 'saved', thingId: thing.id } : it)));
      if (photoFile) uploads.enqueue(thing.id, { file: photoFile, kind: 'photo', role: 'overview' });
    } catch (err) {
      const problems = attributeErrorsFrom(err);
      if (!problems.length) {
        setItems((list) => list.map((it) => (it.key === key ? { ...it, status: 'failed', error: err?.message || "That didn't save. Try again." } : it)));
        return;
      }
      // The type changed under us (a field became required, or went away).
      // Re-read the types — the capture row then asks for it too — and ask
      // for exactly what the server named, in the row.
      let fresh = null;
      try {
        const res = await refetchTypes();
        fresh = res?.data?.thingTypes?.find((t) => t.id === resolvedTypeId) ?? null;
      } catch {
        fresh = null;
      }
      const fields = (fresh ?? typesById.get(resolvedTypeId))?.fields ?? [];
      const gone = problems.filter((p) => !fields.some((f) => f.key === p.key) && /not a field/.test(p.message)).map((p) => p.key);
      const fix = problems
        .filter((p) => !gone.includes(p.key))
        .map((p) => ({
          message: p.message,
          field: fields.find((f) => f.key === p.key) ?? { key: p.key, label: p.message.replace(/\s+is required$/, '') || p.key, kind: 'text', choices: [], unit: null, identifier: false, required: true },
        }));
      const kept = Object.fromEntries(Object.entries(attributes ?? {}).filter(([k]) => !gone.includes(k)));
      setItems((list) =>
        list.map((it) =>
          it.key === key
            ? { ...it, attributes: kept, status: fix.length ? 'needs' : 'failed', fix: fix.length ? fix : null, error: err?.message || "That didn't save. Try again." }
            : it
        )
      );
    }
  };

  const next = async () => {
    if (!name.trim()) {
      setNameError('A name is needed to save it.');
      nameRef.current?.focus();
      return;
    }
    if (unfilled.length) {
      setAttrErrors(Object.fromEntries(unfilled.map((f) => [f.key, `${f.label} is needed to save it.`])));
      document.getElementById(`walk-attr-${unfilled[0].key}`)?.focus();
      return;
    }
    const itemName = name.trim();
    const itemTypeId = typeId;
    const photoFile = photo;
    const attributes = required.length ? buildAttributes(required, attrs) : undefined;
    const type = itemTypeId ? typesById.get(itemTypeId) : null;
    seq += 1;
    const key = `w${seq}`;
    let previewUrl = null;
    try {
      if (photoFile && typeof URL !== 'undefined' && URL.createObjectURL) previewUrl = URL.createObjectURL(photoFile);
    } catch {
      previewUrl = null;
    }
    setItems((list) => [{ key, name: itemName, typeId: itemTypeId, typeIcon: type?.icon, photoFile, previewUrl, attributes, status: 'saving', thingId: null, error: null, fix: null }, ...list]);
    // Reset right away — the keyboard stays up and the camera is ready for the next one.
    setName('');
    setPhoto(null);
    setNameError('');
    setAttrs({});
    setAttrErrors({});
    setSaving(true);
    await runCreate(key, { itemName, itemTypeId, photoFile, attributes });
    setSaving(false);
    requestAnimationFrame(() => nameRef.current?.focus());
  };

  const retryCreate = (key) => {
    const item = items.find((it) => it.key === key);
    if (!item) return;
    runCreate(key, { itemName: item.name, itemTypeId: item.typeId, photoFile: item.photoFile, attributes: item.attributes });
  };

  const fixCreate = (key, fields, values) => {
    const item = items.find((it) => it.key === key);
    if (!item) return;
    runCreate(key, { itemName: item.name, itemTypeId: item.typeId, photoFile: item.photoFile, attributes: { ...(item.attributes ?? {}), ...buildAttributes(fields, values) } });
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
              flexWrap: 'wrap',
              gap: 1,
              px: 2,
              pb: keyboard ? 1.25 : 'calc(10px + env(safe-area-inset-bottom))',
              bgcolor: CHROME.bar,
              backgroundImage: `linear-gradient(180deg, ${LIVERY.orange} 0 4px, transparent 4px)`,
              pt: '14px',
            }
          : { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 2, mt: 2, pt: 2, borderTop: '3px solid', borderColor: 'rule.main' }
      }
    >
      {blockedReason ? (
        <Typography id="walk-next-reason" data-testid="walk-next-reason" sx={{ fontSize: '0.875rem', color: 'text.secondary', flexBasis: isPhone ? '100%' : undefined }}>
          {blockedReason}
        </Typography>
      ) : null}
      <Button
        variant="contained"
        color="load"
        disableElevation
        onClick={next}
        disabled={saving || Boolean(blockedReason)}
        aria-describedby={blockedReason ? 'walk-next-reason' : undefined}
        sx={{
          fontWeight: 800,
          border: 2,
          borderStyle: 'solid',
          borderColor: 'load.contrastText',
          flex: isPhone ? 1 : undefined,
          minHeight: 48,
          fontSize: '1rem',
          // Next is tapped over and over without navigating away; the
          // shared theme presses it to load.dark, its own colour.
        }}
      >
        {saving ? 'Saving…' : 'Next'}
      </Button>
    </Box>
  );

  return (
    <PageFrame maxWidth={640} sx={{ pt: { xs: 2, md: 4 }, pb: { xs: blockedReason ? 'calc(124px + env(safe-area-inset-bottom))' : 'calc(96px + env(safe-area-inset-bottom))', md: 8 } }}>
      <Typography variant="h1" component="h1" sx={visuallyHidden}>
        Pack {place.name}
      </Typography>
      {/* The room's box, flaps open, its label on the front, the tally beside it. */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          mb: 2.5,
          p: 1.5,
          pr: 2,
          borderRadius: '3px',
          border: 1,
          borderColor: 'border',
          bgcolor: 'background.card',
          backgroundImage: (t) => dustImage(t.palette.mode),
        }}
      >
        <Box sx={{ position: 'relative', flexShrink: 0 }}>
          <MovingBox open size={savedCount >= 12 ? 'LARGE' : savedCount >= 4 ? 'MEDIUM' : 'SMALL'} width={96} testId="walk-box" />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <MovingLabel size="lg" kind={kindOf(place)} tilt sx={{ maxWidth: '100%' }}>
            {place.name}
          </MovingLabel>
          <Typography data-testid="walk-count" sx={{ mt: 1, fontSize: '0.9375rem', fontWeight: 700, color: 'text.primary' }}>
            {savedCount} packed into {place.name}
          </Typography>
        </Box>
        <Button variant="outlined" onClick={doneWalking} sx={{ color: 'text.primary', borderColor: 'text.primary', minHeight: 44, flexShrink: 0, alignSelf: 'flex-start' }}>
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
        {required.length ? (
          <Box component="section" aria-labelledby="walk-required-label" data-testid="walk-required" sx={{ display: 'grid', gap: 1.5 }}>
            <Typography id="walk-required-label" component="h2" sx={{ fontSize: '0.875rem', fontWeight: 700, color: 'text.primary' }}>
              {effectiveType.name} needs
            </Typography>
            {required.map((f) => (
              <AttributeField
                key={f.key}
                idPrefix="walk-attr"
                field={f}
                value={attrs[f.key]}
                onChange={(v) => {
                  setAttrs((a) => ({ ...a, [f.key]: v }));
                  if (attrErrors[f.key]) setAttrErrors((errs) => Object.fromEntries(Object.entries(errs).filter(([k]) => k !== f.key)));
                }}
                error={attrErrors[f.key]}
              />
            ))}
          </Box>
        ) : null}
        {/* Enter in the name field advances (the bar's Next sits outside the form on a phone). */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </Box>
      {isPhone ? (
        <Portal>
          <ChromeTheme>{bar}</ChromeTheme>
        </Portal>
      ) : (
        bar
      )}

      {items.length ? (
        <Box sx={{ mt: 3 }}>
          <Typography component="h2" sx={{ fontSize: '0.875rem', fontWeight: 700, color: 'text.primary', mb: 0.5 }}>
            This load · {items.length}
          </Typography>
          <Box component="ul" sx={{ m: 0, p: 0 }}>
            {items.map((item) => (
              <ItemRow key={item.key} item={item} upload={uploadFor(item.thingId)} onRetryCreate={retryCreate} onRetryUpload={uploads.retry} onFix={fixCreate} />
            ))}
          </Box>
        </Box>
      ) : null}
    </PageFrame>
  );
}
