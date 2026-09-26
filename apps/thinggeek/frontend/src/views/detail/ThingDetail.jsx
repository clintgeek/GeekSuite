/**
 * `/thing/:id` — a thing's page, as a sheet over the library (full-height
 * bottom sheet on a phone, a dialog at md+; GeekSheet decides). Deep-
 * linkable: a direct load renders the library underneath and this on top;
 * closing goes back to the library with its filters intact.
 *
 * The query reads through the cache first (cachePolicies: Query.thing), so a
 * card tap paints the name and cover at once and the rest fills in.
 *
 * Everything under the header is keyed by the thing's id, so a revealed
 * serial re-masks the moment you move to another thing (or close the sheet).
 */
import React, { useRef, useState } from 'react';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import { useQuery } from '@apollo/client';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { GeekEmptyState, GeekSheet, useToast } from '@geeksuite/ui';
import { GET_THING } from '../../graphql/queries';
import { useThingActions } from '../../hooks/useThingActions';
import { useVocabulary } from '../../hooks/useThingMeta';
import { useUploads } from '../../hooks/useUploads';
import { isNotMemberError, reportNotMember } from '../../membership';
import TagMark from '../../components/TagMark';
import { libraryPath } from '../../components/navConfig';
import { visuallyHidden } from '../../utils/a11y';
import EditThingDialog from '../edit/EditThingDialog';
import ActionBar from './ActionBar';
import AddFileSheet from './AddFileSheet';
import ConfirmTrashDialog from './ConfirmTrashDialog';
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

export function ThingDetailBody({ thing, onPanel, onFix, uploads, onRetry }) {
  const photoUploads = uploads.filter((u) => u.kind === 'photo');
  const docUploads = uploads.filter((u) => u.kind === 'document');
  const edit = (focus) => () => onPanel('edit', focus);
  return (
    <>
      <Gallery thing={thing} uploads={photoUploads} onAddPhoto={() => onPanel('photo')} onRetry={onRetry} />
      <DetailHeader thing={thing} />
      <ActionBar onEdit={edit()} onAddPhoto={() => onPanel('photo')} onAddDocument={() => onPanel('document')} onMore={() => onPanel('more')} />
      <Box
        key={thing.id}
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1.15fr) minmax(0, 1fr)' },
          alignItems: 'start',
          gap: 1.5,
          p: { xs: 1.5, md: 2 },
          pb: 'calc(24px + env(safe-area-inset-bottom))',
        }}
      >
        <Box sx={{ display: 'grid', gap: 1.5, minWidth: 0 }}>
          <DetailsSection thing={thing} onEdit={edit('details')} />
          <DatesSection dates={thing.dates ?? []} onEdit={edit('dates')} />
          <RelationshipsSection relationships={thing.relationships ?? []} onEdit={edit('relationships')} />
          <NotesSection notes={thing.notes} onEdit={edit('notes')} />
        </Box>
        <Box sx={{ display: 'grid', gap: 1.5, minWidth: 0 }}>
          <ReadinessPanel thing={thing} onFix={onFix} />
          <ValueSection thing={thing} onEdit={edit('value')} />
          <DocumentsSection documents={thing.documents ?? []} uploads={docUploads} onAdd={() => onPanel('document')} onRetry={onRetry} />
        </Box>
      </Box>
    </>
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
  const [panel, setPanel] = useState(null); // edit | photo | document | more | trash
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

  const close = () => navigate(libraryPath(location.search));
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
        icon={<TagMark size={44} />}
        title={error ? "This didn't load" : 'Not in the ledger'}
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
            <Button variant="contained" onClick={close}>
              Back to the library
            </Button>
          </Box>
        }
        sx={{ py: 8 }}
      />
    );
  } else {
    content = <ThingDetailBody thing={thing} onPanel={openPanel} onFix={onFix} uploads={uploads.items} onRetry={uploads.retry} />;
  }

  return (
    <>
      <GeekSheet
        open
        onClose={close}
        snap="full"
        maxWidth="md"
        headerSx={{
          p: 0,
          minHeight: 0,
          zIndex: 3,
          '& [data-geek-sheet="close"]': {
            bgcolor: 'rgba(17, 16, 13, 0.72)',
            color: '#FFFFFF',
            backdropFilter: 'blur(6px)',
            '&:hover': { bgcolor: 'rgba(17, 16, 13, 0.9)' },
          },
        }}
        bodySx={{ p: 0, px: 0, bgcolor: 'background.paper' }}
        dialogProps={{ PaperProps: { sx: { height: 'min(92vh, 1040px)' } } }}
        title={<Typography component="p" sx={visuallyHidden}>{thing?.name || 'Thing details'}</Typography>}
      >
        {content}
      </GeekSheet>

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
            onReport={() => navigate('/insurance')}
            onTrash={() => openPanel('trash')}
          />
          <ConfirmTrashDialog
            open={panel === 'trash'}
            onClose={closePanel}
            title={thing.name}
            trashDays={vocab.trashDays}
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
