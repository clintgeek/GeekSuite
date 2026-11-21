/**
 * Sources (`/sources`): every source, its kind, sections and status, and
 * each feed's health — so a feed never dies quietly (DOCS/NEWSGEEK_PLAN.md
 * "Ingest") — sorted by whose paper it's in ("Reader-added sources"):
 *
 *   In your paper       on for me
 *   From other readers  another reader's source, off for me
 *   Turned off          on by default (or mine), and I switched it off
 *   Retired             only when there are any
 *
 * Every row carries its own on/off (newsSetSourceOn, optimistic). A row keeps
 * its place until the page is left, so a flipped switch can be flipped back
 * where it is. Then **Suggested**: publishers Google News shows us that we
 * don't read directly; "Check" opens the Add sheet on that domain.
 *
 * The **+** opens the Add sheet for every signed-in reader. The summary line
 * and the status filter stay; the filter narrows every section, and so does
 * "Find a source" (by name or homepage, as you type — UX review 2026-11-18,
 * finding 4). A row says its status once: not "Active" (the normal case), not
 * a status its feed line already shows, and no "On/Off" beside the switch.
 */
import React, { useMemo, useRef, useState } from 'react';
import { Box, Button, Chip, CircularProgress, IconButton, InputAdornment, Link, Typography } from '@mui/material';
import { Add as AddIcon, Close as CloseIcon } from '@mui/icons-material';
import { useApolloClient, useMutation, useQuery } from '@apollo/client';
import { GeekSearchField, useToast } from '@geeksuite/ui';
import { Link as RouterLink } from 'react-router-dom';
import Column from '../components/Column';
import HealthIndicator from '../components/HealthIndicator';
import InkSwitch from '../components/InkSwitch';
import KindBadge from '../components/KindBadge';
import PaywallBadge from '../components/PaywallBadge';
import TimeAgo from '../components/TimeAgo';
import { resetArticleLists } from '../graphql/cachePolicies';
import { SET_NEWS_SOURCE_ON } from '../graphql/mutations';
import { GET_NEWS_SOURCES, GET_NEWS_SUGGESTED_SOURCES } from '../graphql/queries';
import { useViewer } from '../hooks/useViewer';
import { GOTHIC, flagSx, visuallyHiddenSx } from '../theme/theme';
import { GROUPS, groupFor, suggestionLine } from '../utils/addSource';
import { hostOf, matchesFilter, matchesName, rowStatus, sourceSummary } from '../utils/sources';
import { SECTION_LABEL, SOURCE_STATUSES, STATUS_LABEL, labelFor } from '../utils/vocab';
import AddSourceSheet from './AddSourceSheet';
import SourceFormDialog from './SourceFormDialog';

const FILTERS = [{ id: 'all', label: 'All' }, { id: 'attention', label: 'Needs attention' }, ...SOURCE_STATUSES.map((s) => ({ id: s, label: STATUS_LABEL[s] }))];
const SUGGESTIONS_SHOWN = 8;

/** Find a source found nothing: under a status filter, say which, since the name may be under another. */
function noMatchLine(query, filter) {
  const label = FILTERS.find((f) => f.id === filter)?.label;
  return filter === 'all' || !label ? `No source called “${query.trim()}”.` : `No source called “${query.trim()}” under ${label}.`;
}

function FeedLine({ feed }) {
  return (
    <Box component="li" sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 3, rowGap: 0.5, py: 1 }}>
      <HealthIndicator health={feed.health} />
      <Typography component="span" sx={{ fontFamily: GOTHIC, fontSize: '0.8125rem', color: 'text.secondary', minWidth: 0, overflowWrap: 'anywhere' }}>
        {hostOf(feed.url)}
      </Typography>
      <Typography component="span" sx={{ fontFamily: GOTHIC, fontSize: '0.8125rem', color: 'text.secondary' }}>
        {feed.lastOkAt ? <TimeAgo value={feed.lastOkAt} prefix="last OK " /> : 'no good fetch yet'}
      </Typography>
    </Box>
  );
}

function SectionHead({ id, children, count }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, borderTop: 2, borderColor: 'text.primary', pt: 2, mt: 8 }}>
      <Typography id={id} component="h2" sx={{ ...flagSx, color: 'text.primary' }}>
        {children}
      </Typography>
      {count != null ? (
        <Typography component="span" sx={{ ...flagSx, color: 'text.secondary' }}>
          {count}
        </Typography>
      ) : null}
    </Box>
  );
}

function SourceRow({ source, onToggle }) {
  const retired = source.status === 'retired';
  const status = rowStatus(source);
  return (
    <Box component="li" data-testid="source-row" data-source-id={source.id} sx={{ py: 4, borderBottom: 1, borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 1 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 2, rowGap: 1, flex: 1, minWidth: 0 }}>
          <Typography variant="h5" component="h3" sx={{ mr: 'auto', minWidth: 0 }}>
            <Link component={RouterLink} to={`/sources/${encodeURIComponent(source.id)}`} underline="hover" sx={{ color: 'text.primary', display: 'inline-flex', alignItems: 'center', minHeight: 44, minWidth: 44 }}>
              {source.name}
            </Link>
          </Typography>
          <PaywallBadge source={source} />
          <KindBadge kind={source.kind} />
        </Box>
        {retired ? null : (
          <InkSwitch
            checked={source.onForMe}
            onChange={(on) => onToggle(source, on)}
            label=""
            ariaLabel={`${source.name} in your paper`}
            sx={{ flexShrink: 0, gap: 0 }}
          />
        )}
      </Box>
      <Typography sx={{ fontFamily: GOTHIC, fontSize: '0.8125rem', color: 'text.secondary', mb: 1 }}>
        {[
          status ? labelFor(STATUS_LABEL, status) : null,
          source.sections.map((s) => labelFor(SECTION_LABEL, s)).join(', '),
          `${source.articlesLast7d} this week`,
          source.addedByMe ? 'added by you' : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Typography>
      <Box component="ul" aria-label={`${source.name} feeds`} sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {source.feeds.map((f) => (
          <FeedLine key={f.id} feed={f} />
        ))}
      </Box>
    </Box>
  );
}

function Empty({ children }) {
  return <Typography sx={{ py: 5, fontStyle: 'italic', color: 'text.secondary' }}>{children}</Typography>;
}

function Suggestions({ onCheck }) {
  const { data, loading, error } = useQuery(GET_NEWS_SUGGESTED_SOURCES, { fetchPolicy: 'cache-and-network' });
  const [all, setAll] = useState(false);
  const list = data?.newsSuggestedSources ?? [];
  const shown = all ? list : list.slice(0, SUGGESTIONS_SHOWN);
  return (
    <Box component="section" aria-labelledby="sources-suggested" data-testid="suggested">
      <SectionHead id="sources-suggested" count={data ? list.length : null}>
        Suggested
      </SectionHead>
      <Typography sx={{ fontFamily: GOTHIC, fontSize: '0.8125rem', color: 'text.secondary', mt: 1 }}>Publishers in Google News results that we don’t read directly.</Typography>
      {loading && !data ? (
        <Box sx={{ py: 5 }}>
          <CircularProgress size={20} aria-label="Loading suggestions" sx={{ color: 'text.secondary' }} />
        </Box>
      ) : null}
      {error && !data ? <Empty>Couldn’t load suggestions.</Empty> : null}
      {data && !list.length ? <Empty>No suggestions. We already read every publisher Google News has shown us.</Empty> : null}
      <Box component="ul" aria-label="Suggested sources" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {shown.map((s) => (
          <Box
            component="li"
            key={s.domain}
            data-testid="suggestion"
            sx={{ display: 'flex', alignItems: 'center', gap: 3, py: 3, borderBottom: 1, borderColor: 'divider' }}
          >
            <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 2, rowGap: 1 }}>
              <Typography sx={{ fontFamily: GOTHIC, fontSize: '0.9375rem', minWidth: 0, overflowWrap: 'anywhere' }}>{suggestionLine(s)}</Typography>
              {s.paywalled ? <PaywallBadge source={{ paywalled: true, access: { paywall: 'hard' } }} /> : null}
            </Box>
            <Button variant="outlined" color="inherit" onClick={() => onCheck(s)} aria-label={`Check ${s.domain}`} sx={{ flexShrink: 0, borderColor: 'text.primary' }}>
              Check
            </Button>
          </Box>
        ))}
      </Box>
      {list.length > SUGGESTIONS_SHOWN && !all ? (
        <Button color="inherit" onClick={() => setAll(true)} sx={{ mt: 2 }}>
          Show all {list.length}
        </Button>
      ) : null}
    </Box>
  );
}

export default function SourcesView() {
  const { isAdmin } = useViewer();
  const client = useApolloClient();
  const { notify } = useToast();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const searchRef = useRef(null);
  // The clear button goes away with the text, so focus goes back to the field, not to the page.
  const clearQuery = () => {
    setQuery('');
    searchRef.current?.focus();
  };
  const finding = query.trim() !== '';
  // { initialUrl, autoRun, key } while the Add sheet is open.
  const [sheet, setSheet] = useState(null);
  const [byHand, setByHand] = useState(false);
  // A flipped row keeps the section it was in until the page is left.
  const [placed, setPlaced] = useState({});
  const { data, loading, error, refetch } = useQuery(GET_NEWS_SOURCES, { fetchPolicy: 'cache-and-network' });
  const [setSourceOn] = useMutation(SET_NEWS_SOURCE_ON);
  const sources = useMemo(() => data?.newsSources ?? [], [data]);
  const shown = useMemo(
    () => sources.filter((s) => matchesFilter(s, filter) && matchesName(s, query)).sort((a, b) => a.name.localeCompare(b.name)),
    [sources, filter, query]
  );
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, sources.filter((s) => matchesFilter(s, f.id)).length])), [sources]);
  const grouped = useMemo(() => {
    const out = Object.fromEntries(GROUPS.map((g) => [g.id, []]));
    shown.forEach((s) => out[placed[s.id] ?? groupFor(s)].push(s));
    return out;
  }, [shown, placed]);

  const toggle = async (source, on) => {
    setPlaced((p) => (source.id in p ? p : { ...p, [source.id]: groupFor(source) }));
    try {
      await setSourceOn({
        variables: { id: source.id, on },
        optimisticResponse: { newsSetSourceOn: { __typename: 'NewsSource', id: source.id, onForMe: on, defaultOn: Boolean(source.defaultOn) } },
      });
      // Which sources a reader sees decides which articles newsArticles returns.
      resetArticleLists(client.cache);
    } catch {
      notify(`Couldn’t turn ${source.name} ${on ? 'on' : 'off'}. Try again.`, { tone: 'error' });
    }
  };

  const openAdd = (initialUrl = '', autoRun = false) => setSheet({ initialUrl, autoRun, key: Date.now() });

  return (
    <Column>
      {/* The top bar names the page (UX review 2026-11-18, finding 7): the summary and Add are the head. */}
      <Box component="header" sx={{ pt: 4, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 3 }}>
        <Box sx={{ mr: 'auto' }}>
          <Typography component="h1" sx={visuallyHiddenSx}>
            Sources
          </Typography>
          <Typography data-testid="sources-summary" sx={{ ...flagSx, color: 'text.secondary' }}>
            {data ? sourceSummary(sources) : ' '}
          </Typography>
        </Box>
        <Button variant="contained" disableElevation startIcon={<AddIcon />} onClick={() => openAdd()} aria-label="Add a source">
          Add
        </Button>
      </Box>

      <GeekSearchField
        label="Find a source"
        placeholder="Find a source"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        inputRef={searchRef}
        fullWidth
        size="small"
        slashFocus={20}
        inputProps={{ 'data-testid': 'find-source', autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false }}
        InputProps={{
          endAdornment: query ? (
            <InputAdornment position="end">
              <IconButton aria-label="Clear the search" onClick={clearQuery} edge="end" sx={{ width: 44, height: 44, color: 'text.secondary' }}>
                <CloseIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </InputAdornment>
          ) : undefined,
        }}
        // The browser's own clear button is painted blue: the spot colour is for official notices only.
        sx={{ mt: 4, '& input::-webkit-search-cancel-button': { display: 'none', WebkitAppearance: 'none' } }}
      />

      <Box role="group" aria-label="Filter by status" sx={{ display: 'flex', gap: 2, overflowX: 'auto', py: 3, mx: { xs: -4, sm: 0 }, px: { xs: 4, sm: 0 } }}>
        {FILTERS.filter((f) => f.id === 'all' || counts[f.id]).map((f) => {
          const selected = filter === f.id;
          return (
            <Chip
              key={f.id}
              label={`${f.label} ${counts[f.id] ?? 0}`}
              onClick={() => setFilter(f.id)}
              aria-pressed={selected}
              variant="outlined"
              sx={{
                fontWeight: selected ? 700 : 500,
                height: 44,
                color: 'text.primary',
                borderColor: selected ? 'text.primary' : 'divider',
                borderWidth: selected ? 2 : 1,
                bgcolor: 'transparent',
              }}
            />
          );
        })}
      </Box>

      {loading && !data ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 10 }}>
          <CircularProgress size={24} aria-label="Loading sources" sx={{ color: 'text.secondary' }} />
        </Box>
      ) : null}
      {error && !data ? (
        <Box role="alert" sx={{ py: 8, textAlign: 'center' }}>
          <Typography sx={{ color: 'text.secondary', mb: 3 }}>Couldn’t load the sources.</Typography>
          <Button variant="outlined" color="inherit" onClick={() => refetch()}>
            Try again
          </Button>
        </Box>
      ) : null}
      {data && !shown.length && (filter !== 'all' || finding || !sources.length) ? (
        <Typography data-testid="sources-none" sx={{ py: 10, textAlign: 'center', fontStyle: 'italic', color: 'text.secondary' }}>
          {!sources.length ? 'No sources yet.' : finding ? noMatchLine(query, filter) : 'No sources match this filter.'}
        </Typography>
      ) : null}

      {data
        ? GROUPS.map((g) => {
            const rows = grouped[g.id];
            // Under a filter, or for Retired, an empty section is left out.
            if (!rows.length && (filter !== 'all' || finding || !g.empty || !sources.length)) return null;
            return (
              <Box component="section" key={g.id} aria-labelledby={`sources-${g.id}`} data-testid={`group-${g.id}`}>
                <SectionHead id={`sources-${g.id}`} count={rows.length}>
                  {g.title}
                </SectionHead>
                {rows.length ? (
                  <Box component="ul" aria-label={g.title} sx={{ listStyle: 'none', m: 0, p: 0 }}>
                    {rows.map((s) => (
                      <SourceRow key={s.id} source={s} onToggle={toggle} />
                    ))}
                  </Box>
                ) : (
                  <Empty>{g.empty}</Empty>
                )}
              </Box>
            );
          })
        : null}

      <Suggestions onCheck={(s) => openAdd(`https://${s.domain}`, true)} />

      {sheet ? (
        <AddSourceSheet
          key={sheet.key}
          open
          onClose={() => setSheet(null)}
          sources={sources}
          initialUrl={sheet.initialUrl}
          autoRun={sheet.autoRun}
          isAdmin={isAdmin}
          onAddByHand={() => {
            setSheet(null);
            setByHand(true);
          }}
        />
      ) : null}
      {byHand ? <SourceFormDialog open isAdmin={isAdmin} onClose={() => setByHand(false)} /> : null}
    </Column>
  );
}
