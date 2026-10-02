/**
 * `/thing/:id` — a thing's page. A PAGE on every size (since 2026-09-29),
 * not a sheet over the library: on a phone, a photo STRIP on
 * top (not a giant hero) so the name, the tape breadcrumb, the actions and
 * the first details are above the fold; at md+, the photo and the header
 * side by side, the sections in two columns below. Back returns to wherever
 * you came from (the library with its filters, a Where level, Attention).
 *
 * The query reads through the cache first (cachePolicies: Query.thing), so a
 * card tap paints the name and cover at once and the rest fills in.
 *
 * Everything under the header is keyed by the thing's id, so a revealed
 * serial re-masks the moment you move to another thing (or leave the page).
 *
 * Where it is: the header's unit-tag breadcrumb (House › Garage › Van)
 * and "Move to…"; a location or container also lists what's Inside (its
 * unit's door rolls up onto it), with Add here. A place with no photo yet
 * leads with its fleet-livery mural instead of an empty photo slot, and the
 * mural carries the page's heading.
 */
import React, { useRef, useState } from 'react';
import { Box, Button, CircularProgress } from '@mui/material';
import { useQuery } from '@apollo/client';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { GeekEmptyState, useToast } from '@geeksuite/ui';
import { GET_THING } from '../../graphql/queries';
import { useThingActions } from '../../hooks/useThingActions';
import { useVocabulary } from '../../hooks/useThingMeta';
import { useUploads } from '../../hooks/useUploads';
import { isNotMemberError, reportNotMember } from '../../membership';
import BoxMark from '../../components/BoxMark';
import { captionForKind } from '../../components/UnitTag';
import TruckMural from '../../components/TruckMural';
import { MoveSheet } from '../../components/WherePicker';
import { goBack } from '../../utils/goBack';
import { labelsPath } from '../../utils/labelUrl';
import EditThingDialog from '../edit/EditThingDialog';
import ActionBar from './ActionBar';
import AddFileSheet from './AddFileSheet';
import ConfirmTrashDialog from './ConfirmTrashDialog';
import ContainsSection from './ContainsSection';
import { isParentKind, kindOf, showsContents } from '../../utils/where';
import DatesSection from './DatesSection';
import DetailHeader from './DetailHeader';
import DetailsSection from './DetailsSection';
import DocumentsSection from './DocumentsSection';
import Gallery from './Gallery';
import MoreSheet from './MoreSheet';
import NotesSection from './NotesSection';
import ReadinessPanel from './ReadinessPanel';
import RelationshipsSection from './RelationshipsSection';
import ValueSection from './ValueSection';
import { ThingAttic } from '../attic/AtticAttention';

export function ThingDetailBody({ thing, onPanel, onFix, uploads, onRetry, atticSlot = null }) {
  const photoUploads = uploads.filter((u) => u.kind === 'photo');
  const docUploads = uploads.filter((u) => u.kind === 'document');
  const edit = (focus) => () => onPanel('edit', focus);
  const kind = kindOf(thing);
  const mural = isParentKind(kind) && !(thing.photos ?? []).length && !photoUploads.length;
  return (
    <Box component="article" aria-labelledby="thing-name" data-testid="thing-page" sx={{ maxWidth: 1120, mx: 'auto', px: { xs: 0, md: 3 }, pt: { xs: 0, md: 3 } }}>
      <Box sx={{ display: { xs: 'block', md: 'grid' }, gridTemplateColumns: { md: 'minmax(0, 1fr) minmax(0, 1fr)' }, gap: mural ? 2 : 3, alignItems: 'stretch' }}>
        {mural ? (
          <TruckMural
            name={thing.name}
            typeName={thing.type?.name}
            caption={captionForKind(kind)}
            headingProps={{ component: 'h1', id: 'thing-name', 'data-testid': 'thing-name' }}
            sx={{ gridColumn: { md: '1 / -1' } }}
          />
        ) : (
          <Gallery thing={thing} uploads={photoUploads} onAddPhoto={() => onPanel('photo')} onRetry={onRetry} />
        )}
        {/* display:contents on a phone, so the action bar can pin to the page, not to this column. */}
        <Box sx={{ display: { xs: 'contents', md: 'flex' }, flexDirection: 'column', justifyContent: 'flex-end', gap: 1.5, minWidth: 0, gridColumn: mural ? { md: '1 / -1' } : undefined }}>
          <DetailHeader thing={thing} onMove={() => onPanel('move')} showName={!mural} />
          <ActionBar onEdit={edit()} onAddPhoto={() => onPanel('photo')} onAddDocument={() => onPanel('document')} onMore={() => onPanel('more')} />
        </Box>
      </Box>
      <Box
        key={thing.id}
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1.15fr) minmax(0, 1fr)' },
          alignItems: 'start',
          gap: 1.5,
          px: { xs: 1.5, md: 0 },
          pt: { xs: 1.5, md: 3 },
          pb: 'calc(24px + env(safe-area-inset-bottom))',
        }}
      >
        <Box sx={{ display: 'grid', gap: 1.5, minWidth: 0 }}>
          {showsContents(thing) ? <ContainsSection thing={thing} /> : null}
          <DetailsSection thing={thing} onEdit={edit('details')} />
          <DatesSection dates={thing.dates ?? []} onEdit={edit('dates')} />
          <RelationshipsSection relationships={thing.relationships ?? []} onEdit={edit('relationships')} />
          <NotesSection notes={thing.notes} onEdit={edit('notes')} />
        </Box>
        <Box sx={{ display: 'grid', gap: 1.5, minWidth: 0 }}>
          <ReadinessPanel thing={thing} onFix={onFix} />
          <ValueSection thing={thing} onEdit={edit('value')} />
          <DocumentsSection documents={thing.documents ?? []} uploads={docUploads} onAdd={() => onPanel('document')} onRetry={onRetry} />
          {atticSlot}
        </Box>
      </Box>
    </Box>
  );
}

export default function ThingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { notify } = useToast();
  const vocab = useVocabulary();
  const { trashThing } = useThingActions();
  const uploads = useUploads(id);
  const [panel, setPanel] = useState(null); // edit | photo | document | more | trash | move
  const [panelArg, setPanelArg] = useState(null);
  const cameraRef = useRef(null);
  const cameraRole = useRef('overview');

  const { data, loading, error, refetch } = useQuery(GET_THING, {
    variables: { id },
    fetchPolicy: 'cache-and-network',
    returnPartialData: true,
    onError: (err) => isNotMemberError(err) && reportNotMember(),
  });
  const thing = data?.thing ?? null;
  const complete = Boolean(thing && thing.fields);

  const close = () => goBack(navigate, location);
  const openPanel = (name, arg = null) => {
    setPanelArg(arg);
    setPanel(name);
  };
  const closePanel = () => setPanel(null);

  const enqueue = (file) => {
    uploads.enqueue(id, file);
    notify(file.kind === 'photo' ? 'Uploading the photo…' : 'Uploading the document…', { tone: 'info' });
  };

  // One-tap fixes: the camera opens straight away with the role already set.
  const takePhoto = (role) => {
    cameraRole.current = role;
    cameraRef.current?.click();
  };
  const onFix = (key) => {
    if (key === 'photo') takePhoto('overview');
    else if (key === 'id-plate') takePhoto('id-plate');
    else if (key === 'receipt') openPanel('document', 'receipt');
    else if (key === 'serial') openPanel('edit', 'details');
    else if (key === 'value') openPanel('edit', 'value');
  };

  let content;
  if (!complete && loading) {
    content = (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 320 }}>
        <CircularProgress size={28} aria-label="Loading" />
      </Box>
    );
  } else if (!thing || !complete) {
    content = (
      <GeekEmptyState
        icon={<BoxMark size={48} />}
        title={error ? "This didn't load" : 'Not in the inventory'}
        description={error ? 'The server did not answer. Try again in a moment.' : "This thing isn't in the household's library — it may be in the Trash."}
        action={
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
            {error ? (
              <Button variant="outlined" onClick={() => refetch()} sx={{ color: 'text.primary' }}>
                Try again
              </Button>
            ) : (
              <Button variant="outlined" onClick={() => navigate('/trash')} sx={{ color: 'text.primary' }}>
                Open the Trash
              </Button>
            )}
            <Button variant="contained" onClick={() => navigate('/')}>
              Back to your things
            </Button>
          </Box>
        }
        sx={{ py: 8 }}
      />
    );
  } else {
    content = <ThingDetailBody thing={thing} onPanel={openPanel} onFix={onFix} uploads={uploads.items} onRetry={uploads.retry} atticSlot={<ThingAttic thingId={thing.id} />} />;
  }

  return (
    <>
      {content}

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        aria-hidden="true"
        tabIndex={-1}
        data-testid="fix-camera-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) enqueue({ file, kind: 'photo', role: cameraRole.current });
        }}
      />

      {complete ? (
        <>
          <EditThingDialog open={panel === 'edit'} onClose={closePanel} thing={thing} focus={panelArg} />
          <MoveSheet open={panel === 'move'} onClose={closePanel} thing={thing} />
          <AddFileSheet
            open={panel === 'photo'}
            kind="photo"
            initialRole={panelArg}
            roles={vocab.photoRoles}
            thingName={thing.name}
            onClose={closePanel}
            onFile={enqueue}
          />
          <AddFileSheet
            open={panel === 'document'}
            kind="document"
            initialRole={panelArg}
            roles={vocab.documentRoles}
            thingName={thing.name}
            onClose={closePanel}
            onFile={enqueue}
          />
          <MoreSheet
            open={panel === 'more'}
            onClose={closePanel}
            title={thing.name}
            trashDays={vocab.trashDays}
            onEdit={() => openPanel('edit')}
            onPrintLabel={() => navigate(labelsPath(thing.id))}
            onReport={() => navigate('/insurance')}
            onTrash={() => openPanel('trash')}
          />
          <ConfirmTrashDialog
            open={panel === 'trash'}
            onClose={closePanel}
            title={thing.name}
            trashDays={vocab.trashDays}
            contentsCount={thing.contentsCount ?? 0}
            parentName={thing.path?.length ? thing.path[thing.path.length - 1].name : null}
            onConfirm={async () => {
              try {
                await trashThing(thing.id);
                closePanel();
                notify(`${thing.name} is in the Trash for ${vocab.trashDays} days.`, { tone: 'success' });
                close();
              } catch (err) {
                notify(err?.message || `Couldn't move ${thing.name} to the Trash.`, { tone: 'error' });
              }
            }}
          />
        </>
      ) : null}
    </>
  );
}
