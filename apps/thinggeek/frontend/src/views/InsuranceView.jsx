/**
 * `/insurance` — the bad-day page. Totals (thingInsuranceTotals), then every
 * thing in scope as a claim line: photo, name, type, make/model, identifiers,
 * value, acquired date and price, receipt on file.
 *
 * Scope: this page's own query string when it has one (`/insurance?type=…`
 * uses the library's codec), otherwise the whole ledger — with an offer to
 * narrow to what the library was just showing.
 *
 * On screen, identifiers stay masked like everywhere else. The PRINTOUT and
 * the CSV carry them in full: they are for the insurer, and the page says so.
 * Printing renders a separate, print-only document into a portal on <body>
 * (styles.css hides the app shell under `body.tg-printing` in print media),
 * so the shell's fixed-height scrolling layout can never clip it to a page.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Box, Button, CircularProgress, LinearProgress, Link, Typography } from '@mui/material';
import {
  CheckCircle as YesIcon,
  FileDownloadOutlined as CsvIcon,
  LockOutlined as LockIcon,
  PrintOutlined as PrintIcon,
  RemoveCircleOutline as NoIcon,
} from '@mui/icons-material';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { useApolloClient, useQuery } from '@apollo/client';
import { GeekErrorState, useToast } from '@geeksuite/ui';
import PageHeader, { PageFrame } from '../components/PageHeader';
import ThingPhoto from '../components/ThingPhoto';
import { coverSrc } from '../components/thingDisplay';
import { thingPath } from '../components/navConfig';
import { IdentifierText } from './detail/IdentifierValue';
import { GET_REPORT_THINGS, GET_THING_INSURANCE_TOTALS } from '../graphql/queries';
import { useFacetContext } from '../hooks/useThingMeta';
import { DISPLAY_FONT } from '../theme/theme';
import { makeModel } from '../utils/attributes';
import { formatCalendarDate } from '../utils/dates';
import { activeChips } from '../utils/facets';
import { buildInsuranceCsv, downloadCsv, fetchAllThings, hasReceipt } from '../utils/insuranceCsv';
import { lastLibrarySearch } from '../utils/lastLibrary';
import { isNarrowed, readLibraryState, reportFilterInputFromSearch } from '../utils/libraryFilter';
import { formatMoney, moneyAmount } from '../utils/money';
import { whereLabel } from '../utils/where';
import { hasValue } from '../utils/identifiers';
import PrintReport from './PrintReport';

function Stat({ label, value, sub }) {
  return (
    <Box sx={{ p: 2, borderRadius: 3, border: 1, borderColor: 'divider', bgcolor: 'background.card', minWidth: 0 }}>
      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.secondary' }}>{label}</Typography>
      <Typography sx={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: { xs: '1.5rem', md: '1.75rem' }, lineHeight: 1.15, mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
      {sub ? <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 0.25 }}>{sub}</Typography> : null}
    </Box>
  );
}

const of = (n, total) => (total ? `${n} of ${total}` : '—');

function ReportRow({ thing }) {
  const ids = (thing.fields ?? []).filter((f) => f.identifier && hasValue(f.value));
  const mm = makeModel(thing.fields);
  const value = moneyAmount(thing.value);
  const price = moneyAmount(thing.acquired?.price);
  const receipt = hasReceipt(thing);
  return (
    <Box
      component="li"
      data-testid="report-row"
      sx={{ listStyle: 'none', display: 'grid', gridTemplateColumns: { xs: '64px minmax(0, 1fr)', md: '72px minmax(0, 1.4fr) minmax(0, 1fr) 132px' }, gap: { xs: 1.5, md: 2 }, alignItems: 'start', py: 1.5, borderBottom: 1, borderColor: 'divider' }}
    >
      <ThingPhoto src={coverSrc(thing)} icon={thing.type?.icon} variant="thumb" radius={8} />
      <Box sx={{ minWidth: 0 }}>
        <Link component={RouterLink} to={thingPath(thing.id)} underline="hover" sx={{ fontWeight: 700, fontSize: '0.9375rem', color: 'text.primary', display: 'inline-flex', minHeight: { xs: 44, md: 0 }, alignItems: 'center' }}>
          {thing.name}
        </Link>
        <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>{[thing.type?.name, mm].filter(Boolean).join(' · ') || '—'}</Typography>
        {whereLabel(thing) ? <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{whereLabel(thing)}</Typography> : null}
        <Box sx={{ display: { xs: 'block', md: 'none' }, mt: 0.75 }}>
          <RowFacts ids={ids} value={value} thing={thing} price={price} receipt={receipt} />
        </Box>
      </Box>
      <Box sx={{ display: { xs: 'none', md: 'block' }, minWidth: 0 }}>
        {ids.length ? (
          ids.map((f) => (
            <Box key={f.key} sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
              {f.label}: <IdentifierText value={f.value} revealed={false} />
            </Box>
          ))
        ) : (
          <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>No identifiers recorded</Typography>
        )}
        <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 0.25 }}>
          {thing.acquired?.date ? `Acquired ${formatCalendarDate(thing.acquired.date)}` : 'Acquired date unknown'}
          {price !== null ? ` · paid ${formatMoney(price)}` : ''}
        </Typography>
      </Box>
      <Box sx={{ display: { xs: 'none', md: 'block' }, textAlign: 'right' }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem', fontVariantNumeric: 'tabular-nums', color: value !== null ? 'text.primary' : 'text.secondary' }}>
          {value !== null ? formatMoney(value, thing.value?.currency) : 'No value'}
        </Typography>
        <ReceiptMark receipt={receipt} sx={{ justifyContent: 'flex-end' }} />
      </Box>
    </Box>
  );
}

function ReceiptMark({ receipt, sx }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem', color: 'text.secondary', mt: 0.25, ...sx }}>
      {receipt ? <YesIcon aria-hidden="true" sx={{ fontSize: 15, color: 'primary.main' }} /> : <NoIcon aria-hidden="true" sx={{ fontSize: 15 }} />}
      {receipt ? 'Receipt on file' : 'No receipt'}
    </Box>
  );
}

function RowFacts({ ids, value, thing, price, receipt }) {
  return (
    <>
      {ids.map((f) => (
        <Box key={f.key} sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
          {f.label}: <IdentifierText value={f.value} revealed={false} />
        </Box>
      ))}
      <Typography sx={{ fontSize: '0.8125rem', color: 'text.primary', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
        {value !== null ? formatMoney(value, thing.value?.currency) : 'No value'}
        <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary' }}>
          {thing.acquired?.date ? ` · acquired ${formatCalendarDate(thing.acquired.date)}` : ''}
          {price !== null ? ` for ${formatMoney(price)}` : ''}
        </Box>
      </Typography>
      <ReceiptMark receipt={receipt} />
    </>
  );
}

/** The print-only document's mount point, and the body class that swaps it in for print media. */
function usePrintRoot() {
  const [node, setNode] = useState(null);
  useEffect(() => {
    const el = document.createElement('div');
    el.id = 'tg-print-root';
    document.body.appendChild(el);
    document.body.classList.add('tg-printing');
    setNode(el);
    return () => {
      document.body.classList.remove('tg-printing');
      el.remove();
    };
  }, []);
  return node;
}

export default function InsuranceView() {
  const client = useApolloClient();
  const location = useLocation();
  const navigate = useNavigate();
  const { notify } = useToast();
  const facetContext = useFacetContext();
  const printRoot = usePrintRoot();

  const ownNarrowed = isNarrowed(readLibraryState(new URLSearchParams(location.search)));
  const lastSearch = lastLibrarySearch();
  const lastNarrowed = lastSearch ? isNarrowed(readLibraryState(new URLSearchParams(lastSearch))) : false;
  const search = ownNarrowed ? location.search : '';
  // The library's filter, minus locations: the report is inventory (the gateway's totals insist too).
  const filter = useMemo(() => reportFilterInputFromSearch(search), [search]);
  const scopeChips = useMemo(() => activeChips(readLibraryState(new URLSearchParams(search)), facetContext), [search, facetContext]);
  const lastChips = useMemo(() => (lastNarrowed ? activeChips(readLibraryState(new URLSearchParams(lastSearch)), facetContext) : []), [lastNarrowed, lastSearch, facetContext]);

  const totalsQuery = useQuery(GET_THING_INSURANCE_TOTALS, { variables: { filter }, fetchPolicy: 'cache-and-network' });
  const totals = totalsQuery.data?.thingInsuranceTotals ?? null;

  const [rows, setRows] = useState({ things: [], loading: true, error: null, loaded: 0, total: null });
  const filterKey = JSON.stringify(filter);
  useEffect(() => {
    let cancelled = false;
    setRows({ things: [], loading: true, error: null, loaded: 0, total: null });
    fetchAllThings(client, GET_REPORT_THINGS, {
      filter,
      onProgress: (loaded, total) => !cancelled && setRows((r) => ({ ...r, loaded, total })),
    })
      .then((things) => !cancelled && setRows({ things, loading: false, error: null, loaded: things.length, total: things.length }))
      .catch((error) => !cancelled && setRows((r) => ({ ...r, loading: false, error })));
    return () => {
      cancelled = true;
    };
    // filterKey is the filter's identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, filterKey]);

  const generatedAt = useMemo(() => new Date(), []);
  const scopeText = scopeChips.length ? scopeChips.map((c) => `${c.group}: ${c.label}`).join(' · ') : 'Everything in the ledger';

  const csv = () => {
    try {
      downloadCsv(buildInsuranceCsv(rows.things));
      notify(`Downloaded ${rows.things.length} thing${rows.things.length === 1 ? '' : 's'} as CSV.`, { tone: 'success' });
    } catch {
      notify("Couldn't build the CSV.", { tone: 'error' });
    }
  };

  const ready = !rows.loading && !rows.error;
  const t = totals;

  return (
    <PageFrame maxWidth={1080}>
      <PageHeader
        title="Insurance report"
        lede="Everything an adjuster will ask for, in one place — print it to PDF or download a spreadsheet, and keep a copy somewhere other than this house."
        actions={
          <>
            <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()} disabled={!ready || !rows.things.length}>
              Print / Save as PDF
            </Button>
            <Button variant="outlined" startIcon={<CsvIcon />} onClick={csv} disabled={!ready || !rows.things.length} sx={{ color: 'text.primary' }}>
              Download CSV
            </Button>
          </>
        }
      />

      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 2 }}>
        <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
          Showing: <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>{scopeText}</Box>
        </Typography>
        {ownNarrowed ? (
          <Button size="small" onClick={() => navigate('/insurance')} sx={{ color: 'text.primary' }}>
            Show everything
          </Button>
        ) : lastNarrowed ? (
          <Button size="small" onClick={() => navigate(`/insurance${lastSearch}`)} sx={{ color: 'text.primary' }}>
            Only what the library is showing ({lastChips.map((c) => c.label).join(', ')})
          </Button>
        ) : null}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.5, mb: 2 }} data-testid="insurance-totals">
        <Stat label="Total value" value={t ? formatMoney(t.totalValue, t.currency) : '…'} sub={t ? `${t.count} thing${t.count === 1 ? '' : 's'}` : ' '} />
        <Stat label="Photo" value={t ? of(t.withPhoto, t.count) : '…'} sub="have at least one" />
        <Stat label="Receipt" value={t ? of(t.withReceipt, t.count) : '…'} sub="on file" />
        <Stat label="Serial" value={t ? of(t.withSerial, t.count) : '…'} sub="recorded, where the type has one" />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, p: 1.5, mb: 2.5, borderRadius: 2, bgcolor: 'background.raised', border: 1, borderColor: 'divider' }}>
        <LockIcon aria-hidden="true" sx={{ fontSize: 18, color: 'text.secondary', mt: '2px' }} />
        <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', lineHeight: 1.55 }}>
          Serial numbers and other identifiers stay masked on this screen. The printout and the CSV include them <b>in full</b> — they're for your insurer. Keep them somewhere safe.
        </Typography>
      </Box>

      {rows.error ? (
        <GeekErrorState title="The report didn't load" description="The server didn't answer. Try again in a moment." onRetry={() => navigate(0)} sx={{ py: 6 }} />
      ) : rows.loading ? (
        <Box sx={{ py: 4 }} aria-busy="true">
          <LinearProgress variant={rows.total ? 'determinate' : 'indeterminate'} value={rows.total ? (rows.loaded / rows.total) * 100 : undefined} aria-label="Loading the report" sx={{ mb: 1.5, borderRadius: 1 }} />
          <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', textAlign: 'center' }}>
            {rows.total ? `Gathering ${rows.loaded} of ${rows.total}…` : 'Gathering the ledger…'}
          </Typography>
        </Box>
      ) : rows.things.length ? (
        <Box component="ul" aria-label="Things in the report" sx={{ m: 0, p: 0, borderTop: 1, borderColor: 'divider' }}>
          {rows.things.map((thing) => (
            <ReportRow key={thing.id} thing={thing} />
          ))}
        </Box>
      ) : (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          {totalsQuery.loading ? <CircularProgress size={22} aria-label="Loading" /> : <Typography sx={{ color: 'text.secondary' }}>Nothing to report yet — add a few things first.</Typography>}
        </Box>
      )}

      {printRoot && ready
        ? createPortal(<PrintReport things={rows.things} totals={totals} scopeText={scopeText} generatedAt={generatedAt} />, printRoot)
        : null}
    </PageFrame>
  );
}
