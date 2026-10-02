/**
 * `/attic` — The Attic: the household's locked unit for family documents
 * (DOCS/THINGGEEK_PLAN.md "The Attic"). Behind AtticGate: set-up on the
 * first visit, the steel door while locked, and once open:
 *
 *   the open door  the lit interior (the motif), "Add a document"
 *   documents      by person (each person a shelf) or by type
 *   People         the household's profiles (add / edit)
 *   Recent access  who opened, revealed or downloaded what, and when
 *   The lock       fingerprints (passkeys) and the PIN
 */
import React, { useMemo, useState } from 'react';
import { Box, Button, ButtonBase, CircularProgress, IconButton, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import { Add as AddIcon, DeleteOutline as RemoveIcon, EditOutlined as EditIcon, FingerprintOutlined as FingerprintIcon, PersonAddAlt1Outlined as PersonAddIcon } from '@mui/icons-material';
import { useMutation, useQuery } from '@apollo/client';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { GeekErrorState, GeekSheet, useToast } from '@geeksuite/ui';
import SectionHeading from '../../components/SectionHeading';
import { CREATE_ATTIC_PERSON, DELETE_ATTIC_PERSON, GET_ATTIC_ACCESS_LOG, GET_ATTIC_HOME, UPDATE_ATTIC_PERSON } from '../../graphql/attic';
import { useLockOnError, useVault } from '../../hooks/useVault';
import { calendarDateToUtcIso, utcIsoToInputValue } from '../../utils/dates';
import AtticDoor from './AtticDoor';
import { AtticGate, HERO_BUTTON_SX, PinField } from './AtticLock';
import { DocList, accessSentence, accessWhen, panelSx } from './AtticParts';

const RELATIONS = ['Self', 'Spouse', 'Partner', 'Child', 'Parent', 'Pet', 'Other'];

function PersonSheet({ open, onClose, person }) {
  const { notify } = useToast();
  const vault = useVault();
  const [name, setName] = useState(person?.name ?? '');
  const [relation, setRelation] = useState(person?.relation ?? '');
  const [birth, setBirth] = useState(utcIsoToInputValue(person?.birthDate));
  const [create, { loading: creating }] = useMutation(CREATE_ATTIC_PERSON, { refetchQueries: [GET_ATTIC_HOME] });
  const [update, { loading: updating }] = useMutation(UPDATE_ATTIC_PERSON, { refetchQueries: [GET_ATTIC_HOME] });
  const [remove] = useMutation(DELETE_ATTIC_PERSON, { refetchQueries: [GET_ATTIC_HOME] });
  React.useEffect(() => {
    if (open) {
      setName(person?.name ?? '');
      setRelation(person?.relation ?? '');
      setBirth(utcIsoToInputValue(person?.birthDate));
    }
  }, [open, person]);
  const save = async (e) => {
    e?.preventDefault();
    const input = { name: name.trim(), relation: relation || null, birthDate: birth ? calendarDateToUtcIso(birth) : null };
    try {
      if (person) await update({ variables: { id: person.id, input } });
      else await create({ variables: { input } });
      onClose();
    } catch (err) {
      vault.handleError(err);
      notify(err?.message || 'That didn’t save.', { tone: 'error' });
    }
  };
  const del = async () => {
    try {
      await remove({ variables: { id: person.id } });
      onClose();
    } catch (err) {
      vault.handleError(err);
      notify(err?.message || 'That person still has documents.', { tone: 'error' });
    }
  };
  return (
    <GeekSheet
      open={open}
      onClose={onClose}
      title={person ? `Edit ${person.name}` : 'Add a person'}
      actions={
        <>
          {person && !person.documentCount ? (
            <Button onClick={del} startIcon={<RemoveIcon />} sx={{ minHeight: 44, color: 'text.primary', mr: 'auto' }}>
              Remove
            </Button>
          ) : null}
          <Button type="submit" form="attic-person-form" variant="contained" disabled={!name.trim() || creating || updating} sx={HERO_BUTTON_SX}>
            {person ? 'Save' : 'Add person'}
          </Button>
        </>
      }
    >
      <Box component="form" id="attic-person-form" onSubmit={save} sx={{ display: 'grid', gap: 2, pt: 1 }}>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus required inputProps={{ maxLength: 120, autoComplete: 'off' }} />
        <TextField select label="Who they are" value={relation} onChange={(e) => setRelation(e.target.value)}>
          <MenuItem value="">—</MenuItem>
          {RELATIONS.map((r) => (
            <MenuItem key={r} value={r}>
              {r}
            </MenuItem>
          ))}
        </TextField>
        <TextField label="Birth date (optional)" type="date" value={birth} onChange={(e) => setBirth(e.target.value)} InputLabelProps={{ shrink: true }} />
      </Box>
    </GeekSheet>
  );
}

function PeopleSection({ people, onEdit, onAdd }) {
  return (
    <Box component="section" aria-labelledby="attic-people-heading" sx={panelSx}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, minHeight: 32 }}>
        <SectionHeading id="attic-people-heading">People</SectionHeading>
        <Button size="small" onClick={onAdd} startIcon={<PersonAddIcon />} sx={{ minHeight: 44, color: 'text.primary', fontWeight: 700 }}>
          Add
        </Button>
      </Box>
      {people.length ? (
        <Box component="ul" sx={{ m: 0, p: 0, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {people.map((p) => (
            <Box component="li" key={p.id} sx={{ listStyle: 'none' }}>
              <ButtonBase
                onClick={() => onEdit(p)}
                aria-label={`Edit ${p.name}`}
                sx={{ minHeight: 44, px: 1.5, gap: 1, borderRadius: '22px', border: 1, borderColor: 'border', bgcolor: 'background.paper', color: 'text.primary', fontWeight: 700, fontSize: '0.9375rem' }}
              >
                {p.name}
                <Box component="span" sx={{ fontWeight: 500, fontSize: '0.8125rem', color: 'text.secondary' }}>
                  {[p.relation, `${p.documentCount} doc${p.documentCount === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
                </Box>
                <EditIcon aria-hidden="true" sx={{ fontSize: 16, color: 'text.secondary' }} />
              </ButtonBase>
            </Box>
          ))}
        </Box>
      ) : (
        <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Add the people whose papers live here: you, Heather, the kids, even the dog.</Typography>
      )}
    </Box>
  );
}

function RecentAccess() {
  const [all, setAll] = useState(false);
  const { data, loading } = useQuery(GET_ATTIC_ACCESS_LOG, { variables: { limit: all ? 40 : 8 }, fetchPolicy: 'network-only' });
  const rows = data?.atticAccessLog ?? [];
  return (
    <Box component="section" aria-labelledby="attic-access-heading" sx={panelSx} data-testid="attic-access">
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5, minHeight: 32 }}>
        <SectionHeading id="attic-access-heading">Recent access</SectionHeading>
        {!all && rows.length >= 8 ? (
          <Button size="small" onClick={() => setAll(true)} sx={{ minHeight: 44, color: 'text.primary', fontWeight: 700 }}>
            Show more
          </Button>
        ) : null}
      </Box>
      <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mb: 1 }}>Every unlock, every number revealed, every image opened — by whom and when. Never the numbers themselves.</Typography>
      {loading && !rows.length ? (
        <CircularProgress size={20} aria-label="Loading" />
      ) : (
        <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none' }}>
          {rows.map((e) => (
            <Box component="li" key={e.id} data-testid="access-row" data-action={e.action} sx={{ display: 'flex', gap: 1.5, alignItems: 'baseline', py: 0.75, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
              <Typography sx={{ flex: 1, minWidth: 0, fontSize: '0.875rem', color: e.action === 'unlock-failed' ? 'status.overdue' : 'text.primary', fontWeight: e.action === 'unlock-failed' ? 700 : 500 }}>
                {accessSentence(e)}
              </Typography>
              <Typography component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary', flexShrink: 0, whiteSpace: 'nowrap' }}>
                {accessWhen(e.at)}
              </Typography>
            </Box>
          ))}
          {!rows.length ? <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Nothing yet.</Typography> : null}
        </Box>
      )}
    </Box>
  );
}

function LockSettings() {
  const vault = useVault();
  const { notify } = useToast();
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const addPasskey = async () => {
    setBusy(true);
    try {
      await vault.registerPasskey('This phone');
      notify('Fingerprint added.', { tone: 'success' });
    } catch (err) {
      notify(err?.message || 'That didn’t work.', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const changePin = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      await vault.setPin(pin);
      setPinOpen(false);
      setPin('');
      notify('PIN changed.', { tone: 'success' });
    } catch (err) {
      notify(err?.message || 'That PIN wasn’t accepted.', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box component="section" aria-labelledby="attic-lock-heading" sx={panelSx}>
      <SectionHeading id="attic-lock-heading">Your lock</SectionHeading>
      <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 0.5, mb: 1 }}>Each member has their own fingerprints and PIN.</Typography>
      <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none' }}>
        {(vault.passkeys ?? []).map((p) => (
          <Box component="li" key={p.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 48, borderBottom: 1, borderColor: 'divider' }}>
            <FingerprintIcon aria-hidden="true" sx={{ color: 'text.secondary' }} />
            <Typography sx={{ flex: 1, fontSize: '0.9375rem', fontWeight: 600 }}>{p.label}</Typography>
            <Tooltip title="Remove this fingerprint">
              <IconButton aria-label={`Remove ${p.label}`} onClick={() => vault.removePasskey(p.id).catch((err) => notify(err?.message || 'Couldn’t remove it.', { tone: 'error' }))} sx={{ width: 44, height: 44, color: 'text.secondary' }}>
                <RemoveIcon />
              </IconButton>
            </Tooltip>
          </Box>
        ))}
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.5 }}>
        {vault.passkeysSupported ? (
          <Button variant="outlined" onClick={addPasskey} disabled={busy} startIcon={<FingerprintIcon />} sx={{ minHeight: 44, color: 'text.primary', borderColor: 'border' }}>
            Add a fingerprint
          </Button>
        ) : null}
        <Button variant="outlined" onClick={() => setPinOpen(true)} sx={{ minHeight: 44, color: 'text.primary', borderColor: 'border' }}>
          Change PIN
        </Button>
      </Box>
      <GeekSheet
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        title="Change your PIN"
        actions={
          <Button type="submit" form="attic-change-pin" variant="contained" disabled={busy || pin.length < 6} sx={HERO_BUTTON_SX}>
            Save PIN
          </Button>
        }
      >
        <Box component="form" id="attic-change-pin" onSubmit={changePin} sx={{ pt: 1 }}>
          <PinField id="attic-change-pin-field" label="New PIN" value={pin} onChange={setPin} autoFocus helperText="6 to 12 digits." />
        </Box>
      </GeekSheet>
    </Box>
  );
}

function groupBy(docs, keyFn) {
  const map = new Map();
  for (const d of docs) {
    for (const k of keyFn(d)) {
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(d);
    }
  }
  return map;
}

function AtticHome() {
  const vault = useVault();
  const [params, setParams] = useSearchParams();
  const by = params.get('by') === 'type' ? 'type' : 'person';
  const [personSheet, setPersonSheet] = useState({ open: false, person: null });
  const { data, loading, error, refetch } = useQuery(GET_ATTIC_HOME, { fetchPolicy: 'cache-and-network' });
  useLockOnError(error);
  const people = useMemo(() => data?.atticPeople ?? [], [data]);
  const types = useMemo(() => data?.atticDocumentTypes ?? [], [data]);
  const docs = useMemo(() => data?.atticDocuments ?? [], [data]);

  const groups = useMemo(() => {
    if (by === 'type') {
      const g = groupBy(docs, (d) => [d.type?.id ?? 'none']);
      return types.filter((t) => g.has(t.id)).map((t) => ({ id: t.id, title: t.name, docs: g.get(t.id) }));
    }
    const g = groupBy(docs, (d) => (d.people?.length ? d.people.map((p) => p.id) : ['nobody']));
    const out = people.map((p) => ({ id: p.id, title: p.name, docs: g.get(p.id) ?? [] }));
    if (g.has('nobody')) out.push({ id: 'nobody', title: 'Household', docs: g.get('nobody') });
    return out;
  }, [by, docs, people, types]);

  if (error && !data) {
    return <GeekErrorState title="The Attic didn't load" description="The server didn't answer. Try again in a moment." onRetry={() => refetch()} sx={{ py: 6 }} />;
  }

  return (
    <Box data-testid="attic-home" sx={{ display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 360px) minmax(0, 1fr)' }, gap: 2, alignItems: 'center' }}>
        <AtticDoor open height={150} />
        <Box sx={{ display: 'grid', gap: 1 }}>
          <Typography sx={{ color: 'text.secondary', fontSize: '0.9375rem', lineHeight: 1.55 }}>
            {docs.length ? `${docs.length} document${docs.length === 1 ? '' : 's'} on the shelves.` : 'Empty shelves. Start with the papers you’d grab in a fire: passports, birth certificates, the insurance cards.'} Numbers stay sealed until you reveal them, one at a time.
          </Typography>
          <Button component={RouterLink} to="/attic/add" variant="contained" startIcon={<AddIcon />} sx={{ ...HERO_BUTTON_SX, justifySelf: { xs: 'stretch', md: 'start' } }} data-testid="attic-add">
            Add a document
          </Button>
        </Box>
      </Box>

      <Box component="section" aria-labelledby="attic-docs-heading" sx={panelSx}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 1 }}>
          <SectionHeading id="attic-docs-heading" count={docs.length}>
            Documents
          </SectionHeading>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={by}
            onChange={(_e, v) => v && setParams(v === 'type' ? { by: 'type' } : {}, { replace: true })}
            aria-label="Group documents"
          >
            <ToggleButton value="person" sx={{ minHeight: 44, px: 1.5, color: 'text.primary', fontWeight: 700 }}>
              By person
            </ToggleButton>
            <ToggleButton value="type" sx={{ minHeight: 44, px: 1.5, color: 'text.primary', fontWeight: 700 }}>
              By type
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
        {loading && !data ? (
          <CircularProgress size={24} aria-label="Loading" />
        ) : groups.length ? (
          <Box sx={{ display: 'grid', gap: 2 }}>
            {groups.map((g) => (
              <Box key={g.id} data-testid="attic-group">
                <Typography component="h3" sx={{ fontWeight: 800, fontSize: '1rem', borderBottom: '3px solid', borderColor: 'rule.main', pb: 0.5, mb: 0.5 }}>
                  {g.title}{' '}
                  <Box component="span" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.875rem' }}>
                    {g.docs.length}
                  </Box>
                </Typography>
                <DocList docs={g.docs} showPeople={by === 'type'} empty="Nothing for them yet." />
              </Box>
            ))}
          </Box>
        ) : (
          <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>No documents yet.</Typography>
        )}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2, alignItems: 'start' }}>
        <PeopleSection people={people} onAdd={() => setPersonSheet({ open: true, person: null })} onEdit={(p) => setPersonSheet({ open: true, person: p })} />
        <LockSettings />
      </Box>
      <RecentAccess />
      <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
        <Box component={RouterLink} to="/attic/types" sx={{ color: 'text.primary', fontWeight: 700 }}>
          Document types
        </Box>{' '}
        — what each kind of paper asks for, and how early its expiry warns.
      </Typography>
      <PersonSheet open={personSheet.open} person={personSheet.person} onClose={() => setPersonSheet({ open: false, person: null })} />
    </Box>
  );
}

export default function AtticView() {
  return (
    <AtticGate title="The Attic">
      <AtticHome />
    </AtticGate>
  );
}
