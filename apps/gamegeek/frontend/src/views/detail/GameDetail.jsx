/**
 * `/game/:id` — the detail sheet over the library. A full-height bottom sheet
 * on a phone, a dialog at md+ (GeekSheet decides). Deep-linkable: a direct
 * load renders the library underneath and this on top; closing goes back to
 * the library with its filters intact.
 *
 * The query reads through the cache first (cachePolicies: Query.game), so a
 * card tap paints the hero at once and the rest fills in.
 */
import React, { useRef, useState } from 'react';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import { useQuery } from '@apollo/client';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { GeekEmptyState, GeekSheet, useToast } from '@geeksuite/ui';
import { GET_GAME } from '../../graphql/queries';
import { useGameProfile, useShelfList, useVocabulary } from '../../hooks/useGameMeta';
import { useRateGame, useSetShelf } from '../../hooks/useGameActions';
import SavePointMark from '../../components/SavePointMark';
import { libraryPath } from '../../components/navConfig';
import { shelfLabel, sortPlatforms } from '../../utils/vocab';
import { visuallyHidden } from '../../utils/a11y';
import ActionBar from './ActionBar';
import ConfirmDeleteDialog from './ConfirmDeleteDialog';
import CopiesDialog from './CopiesDialog';
import CopiesSection from './CopiesSection';
import CoverToolsDialog from './CoverToolsDialog';
import DetailHero from './DetailHero';
import DetailsSection from './DetailsSection';
import EditGameDialog from './EditGameDialog';
import FindMetadataDialog from './FindMetadataDialog';
import HouseholdSection from './HouseholdSection';
import LogSessionSheet from './LogSessionSheet';
import MoreSheet from './MoreSheet';
import NotesSection from './NotesSection';
import PlaythroughsSection from './PlaythroughsSection';
import RatingSection from './RatingSection';
import SessionsSection from './SessionsSection';
import ShelfSheet from './ShelfSheet';
import StatusSection from './StatusSection';
import UnlinkMetadataDialog from './UnlinkMetadataDialog';
import { useDetailActions } from './useDetailActions';


export default function GameDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { notify } = useToast();
  const [panel, setPanel] = useState(null); // shelf | log | more | edit | cover | copies | metadata | unlink-metadata | delete
  const ratingRef = useRef(null);

  const { data, loading, error, refetch } = useQuery(GET_GAME, {
    variables: { id },
    fetchPolicy: 'cache-and-network',
    returnPartialData: true,
  });
  const game = data?.game ?? null;

  const vocab = useVocabulary();
  const { profile } = useGameProfile();
  const shelves = useShelfList();
  const customShelves = profile?.customShelves ?? [];
  const rate = useRateGame();
  const setShelf = useSetShelf(customShelves);
  const actions = useDetailActions(id);

  const close = () => navigate(libraryPath(location.search));
  const closePanel = () => setPanel(null);

  const platformChoices = sortPlatforms([
    ...(game?.copies || []).map((c) => c.platform),
    ...(profile?.platformsOwned || []),
    ...(game?.platformsAvailable || []),
  ]);

  let content;
  if (!game && loading) {
    content = (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 320 }}>
        <CircularProgress size={28} aria-label="Loading game" />
      </Box>
    );
  } else if (!game) {
    content = (
      <GeekEmptyState
        icon={<SavePointMark size={44} />}
        title={error ? "This game didn't load" : 'No save file here'}
        description={error ? 'The server did not answer. Try again in a moment.' : "This game isn't in the household library — it may have been deleted."}
        action={
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
            {error ? <Button variant="outlined" onClick={() => refetch()} sx={{ color: 'text.primary' }}>Try again</Button> : null}
            <Button variant="contained" onClick={close}>Back to the library</Button>
          </Box>
        }
        sx={{ py: 8 }}
      />
    );
  } else {
    const me = game.me || {};
    const shelfName = me.shelf ? shelfLabel(me.shelf, customShelves) : 'Shelve';
    content = (
      <>
        <DetailHero game={game} />
        <ActionBar
          shelfName={shelfName}
          rating={me.rating}
          onStatus={() => setPanel('shelf')}
          onLog={() => setPanel('log')}
          onRate={() => {
            const node = ratingRef.current;
            node?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
            node?.querySelector('[role="slider"]')?.focus({ preventScroll: true });
          }}
          onMore={() => setPanel('more')}
        />
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' },
            alignItems: 'start',
            gap: 1.5,
            p: { xs: 1.5, md: 2 },
            pb: 'calc(24px + env(safe-area-inset-bottom))',
          }}
        >
          <Box sx={{ display: 'grid', gap: 1.5, minWidth: 0 }}>
            <StatusSection game={game} customShelves={customShelves} onChangeShelf={() => setPanel('shelf')} />
            <RatingSection ref={ratingRef} game={game} onRate={rate} />
            <SessionsSection
              sessions={me.sessions ?? []}
              onLog={() => setPanel('log')}
              onDelete={(sid) => actions.deleteSession(sid)}
            />
            <PlaythroughsSection
              playthroughs={me.playthroughs ?? []}
              platforms={platformChoices.length ? platformChoices : vocab.platforms}
              completionLevels={vocab.completionLevels}
              onSave={(input) => actions.savePlaythrough(input)}
              onDelete={(pid) => actions.deletePlaythrough(pid)}
            />
          </Box>
          <Box sx={{ display: 'grid', gap: 1.5, minWidth: 0 }}>
            <CopiesSection copies={game.copies ?? []} onEdit={() => setPanel('copies')} />
            <NotesSection game={game} />
            <DetailsSection game={game} onFindMetadata={() => setPanel('metadata')} />
            <HouseholdSection entries={game.household ?? []} />
          </Box>
        </Box>
      </>
    );
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
            bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(14,17,22,0.6)' : 'rgba(255,255,255,0.75)'),
            backdropFilter: 'blur(6px)',
            color: 'text.primary',
            '&:hover': { bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(14,17,22,0.8)' : 'rgba(255,255,255,0.95)') },
          },
        }}
        bodySx={{ p: 0, px: 0, bgcolor: 'background.paper' }}
        dialogProps={{ PaperProps: { sx: { height: 'min(92vh, 1000px)' } } }}
        title={<Typography component="p" sx={visuallyHidden}>{game?.title || 'Game details'}</Typography>}
      >
        {content}
      </GeekSheet>

      {game ? (
        <>
          <ShelfSheet
            open={panel === 'shelf'}
            onClose={closePanel}
            shelves={shelves}
            value={game.me?.shelf ?? null}
            gameTitle={game.title}
            onPick={async (shelf) => {
              closePanel();
              await setShelf(game, shelf);
            }}
          />
          <LogSessionSheet
            open={panel === 'log'}
            onClose={closePanel}
            game={game}
            profile={profile}
            vocabPlatforms={vocab.platforms}
            onSubmit={async (input) => {
              const wasShelf = game.me?.shelf ?? null;
              const res = await actions.logSession(input);
              const now = res.data?.logGameSession?.me?.shelf;
              notify(now === 'playing' && wasShelf !== 'playing' ? `Logged — ${game.title} is on Playing now.` : 'Session logged.', { tone: 'success' });
            }}
          />
          <MoreSheet
            open={panel === 'more'}
            onClose={closePanel}
            title={game.title}
            onEdit={() => setPanel('edit')}
            onCover={() => setPanel('cover')}
            onCopies={() => setPanel('copies')}
            onFindMetadata={() => setPanel('metadata')}
            onRefreshMetadata={async () => {
              try {
                await actions.refreshMetadata();
                notify(`Looking up details for ${game.title}…`, { tone: 'success' });
              } catch (err) {
                notify(err?.message || "Couldn't refresh metadata.", { tone: 'error' });
              }
            }}
            onUnlinkMetadata={() => setPanel('unlink-metadata')}
            enrichmentStatus={game.enrichment?.status}
            onDelete={() => setPanel('delete')}
          />
          <EditGameDialog open={panel === 'edit'} onClose={closePanel} game={game} vocab={vocab} onSave={(input) => actions.updateGame(input)} />
          <FindMetadataDialog
            open={panel === 'metadata'}
            onClose={closePanel}
            game={game}
            onApply={(candidate) => actions.applyMetadataCandidate(candidate)}
            onApplied={(candidate) => {
              const provider = candidate.provider === 'igdb' ? 'IGDB' : candidate.provider === 'rawg' ? 'RAWG' : 'Steam';
              notify(`Details from ${provider} applied.`, { tone: 'success' });
            }}
          />
          <UnlinkMetadataDialog
            open={panel === 'unlink-metadata'}
            onClose={closePanel}
            title={game.title}
            onConfirm={async () => {
              try {
                await actions.unlinkMetadata();
                closePanel();
                notify('Metadata unlinked.', { tone: 'success' });
              } catch (err) {
                notify(err?.message || "Couldn't unlink metadata.", { tone: 'error' });
              }
            }}
          />
          <CopiesDialog
            open={panel === 'copies'}
            onClose={closePanel}
            game={game}
            vocab={vocab}
            defaultPlatform={profile?.defaultPlatform}
            onSave={(input) => actions.updateGame(input)}
          />
          <CoverToolsDialog
            open={panel === 'cover'}
            onClose={closePanel}
            game={game}
            onFetch={actions.fetchCover}
            onUpload={actions.uploadCover}
            onRemove={actions.removeCover}
          />
          <ConfirmDeleteDialog
            open={panel === 'delete'}
            onClose={closePanel}
            title={game.title}
            onConfirm={async () => {
              try {
                await actions.deleteGame();
                closePanel();
                notify(`${game.title} was deleted.`, { tone: 'success' });
                close();
              } catch {
                notify(`Couldn't delete ${game.title}.`, { tone: 'error' });
              }
            }}
          />
        </>
      ) : null}
    </>
  );
}
