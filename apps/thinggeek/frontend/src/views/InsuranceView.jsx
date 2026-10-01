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
 *
 * Moving Day: on screen this is the mover's inventory sheet — a printed
 * bill-of-lading form: a header block of ruled fields, the total insured
 * value on an odometer reel, check boxes for what's on file, and numbered
 * ruled lines with a value column. The printout stays plain black on white.
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
import { CHROME, DISPLAY_FONT, STENCIL_FONT } from '../theme/theme';
import { CheckSquare } from '../components/OnboardingChecklist';
import { visuallyHidden } from '../utils/a11y';
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

/**
 * The odometer: the total insured value on a reel of black drums with white
 * numerals. The reel is aria-hidden; the same amount is real text beside it.
 */
export function OdometerReel({ text, label = 'Total insured value' }) {
  const chars = Array.from(text ?? '');
  return (
    <Box data-testid="odometer" sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5, minWidth: 0, maxWidth: '100%' }}>
      <Box component="span" sx={visuallyHidden}>
        {label}: {text}
      </Box>
      <Box aria-hidden="true" sx={{ display: 'inline-flex', alignItems: 'stretch', p: '4px', bgcolor: '#000', borderRadius: '4px', boxShadow: 'inset 0 0 0 2px #3A332C', maxWidth: '100%', overflow: 'hidden' }}>
        {chars.map((c, i) => {
          const drum = c >= '0' && c <= '9';
          return (
            <Box
              // A fixed string, never reordered.
              key={i}
              component="span"
              sx={{
                display: 'grid',
                placeItems: 'center',
                minWidth: drum ? { xs: 22, md: 28 } : { xs: 10, md: 12 },
                height: { xs: 36, md: 44 },
                mx: drum ? '1px' : 0,
                borderRadius: '2px',
                color: CHROME.text,
                fontFamily: DISPLAY_FONT,
                fontWeight: 700,
                fontSize: { xs: '1.375rem', md: '1.75rem' },
                fontVariantNumeric: 'tabular-nums',
                background: drum ? 'linear-gradient(180deg, #3B3530 0%, #15120F 22%, #15120F 78%, #3B3530 100%)' : 'transparent',
                boxShadow: drum ? 'inset 0 1px 0 rgba(255,255,255,0.12)' : 'none',
              }}
            >
              {c}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

/** One ruled field on the form: a small caption over its value. */
function Field({ label, children, sx }) {
  return (
    <Box sx={{ minWidth: 0, borderBottom: 1, borderColor: 'divider', pb: 0.75, ...sx }}>
      <Typography component="span" sx={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'text.secondary' }}>
        {label}
      </Typography>
      <Box sx={{ fontSize: '0.9375rem', fontWeight: 600, color: 'text.primary', minWidth: 0, overflowWrap: 'anywhere' }}>{children}</Box>
    </Box>
  );
}

/** A tick-box line on the form: "[✓] Photo 3 of 5 · have at least one". */
function Stat({ label, value, sub, done }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
      <CheckSquare done={done} sx={{ mt: '2px' }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.875rem', fontWeight: 800, color: 'text.primary', lineHeight: 1.3 }}>
          {label}{' '}
          <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {value}
          </Box>
        </Typography>
        {sub ? <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{sub}</Typography> : null}
      </Box>
    </Box>
  );
}

const of = (n, total) => (total ? `${n} of ${total}` : '—');
const itemNo = (i) => String(i + 1).padStart(3, '0');

function ReportRow({ thing, index }) {
  const ids = (thing.fields ?? []).filter((f) => f.identifier && hasValue(f.value));
  const mm = makeModel(thing.fields);
  const value = moneyAmount(thing.value);
  const price = moneyAmount(thing.acquired?.price);
  const receipt = hasReceipt(thing);
  return (
    <Box
      component="li"
      data-testid="report-row"
      sx={{ listStyle: 'none', display: 'grid', gridTemplateColumns: { xs: '30px 56px minmax(0, 1fr)', md: '40px 64px minmax(0, 1.4fr) minmax(0, 1fr) 132px' }, gap: { xs: 1.25, md: 2 }, alignItems: 'start', py: 1.5, px: { xs: 1, md: 1.5 }, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}
    >
      <Typography component="span" aria-hidden="true" sx={{ fontFamily: STENCIL_FONT, fontSize: '0.8125rem', color: 'text.secondary', pt: '4px', fontVariantNumeric: 'tabular-nums' }}>
        {itemNo(index)}
      </Typography>
      <ThingPhoto src={coverSrc(thing)} icon={thing.type?.icon} variant="thumb" radius={2} />
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
      {receipt ? <YesIcon aria-hidden="true" sx={{ fontSize: 15, color: 'text.primary' }} /> : <NoIcon aria-hidden="true" sx={{ fontSize: 15 }} />}
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
  const scopeText = scopeChips.length ? scopeChips.map((c) => `${c.group}: ${c.label}`).join(' · ') : 'Everything in the inventory';

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

      {/* The inventory sheet's header block: a printed form. */}
      <Box
        data-testid="insurance-totals"
        sx={{ mb: 2, border: 1, borderColor: 'border', borderTop: '6px solid', borderTopColor: 'rule.main', borderRadius: '2px', bgcolor: 'background.paper', p: { xs: 1.5, md: 2.5 }, boxShadow: '0 3px 0 rgba(40, 25, 10, 0.16)' }}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2, mb: 2 }}>
          <Box sx={{ minWidth: 0 }}>
            <Box component="span" aria-hidden="true" data-caption="HOUSEHOLD GOODS" sx={{ display: 'block', fontFamily: STENCIL_FONT, fontSize: '0.75rem', letterSpacing: '0.14em', color: 'text.secondary', '&::before': { content: 'attr(data-caption)' } }} />
            <Typography component="h2" sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: { xs: '1.5rem', md: '1.875rem' }, lineHeight: 1.1 }}>
              Inventory sheet
            </Typography>
            <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>{t ? `${t.count} item${t.count === 1 ? '' : 's'} declared` : 'Counting…'}</Typography>
          </Box>
          <OdometerReel text={t ? formatMoney(t.totalValue, t.currency) : '$0'} />
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: '1fr 1fr 2fr' }, columnGap: 2, rowGap: 1.25, mb: 2 }}>
          <Field label="Shipper">This household</Field>
          <Field label="Prepared">{generatedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Field>
          <Field label="Contents" sx={{ gridColumn: { xs: '1 / -1', md: 'auto' } }}>
            {scopeText}
          </Field>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25 }}>
          <Stat label="Photo" value={t ? of(t.withPhoto, t.count) : '…'} sub="have at least one" done={Boolean(t && t.count && t.withPhoto === t.count)} />
          <Stat label="Receipt" value={t ? of(t.withReceipt, t.count) : '…'} sub="on file" done={Boolean(t && t.count && t.withReceipt === t.count)} />
          <Stat label="Serial" value={t ? of(t.withSerial, t.count) : '…'} sub="recorded, where the type has one" done={Boolean(t && t.count && t.withSerial === t.count)} />
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, p: 1.5, mb: 2.5, borderRadius: '2px', bgcolor: 'background.card', border: 1, borderColor: 'border' }}>
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
            {rows.total ? `Gathering ${rows.loaded} of ${rows.total}…` : 'Gathering everything…'}
          </Typography>
        </Box>
      ) : rows.things.length ? (
        <Box sx={{ border: 1, borderColor: 'border', borderRadius: '2px', bgcolor: 'background.paper', overflow: 'hidden' }}>
          {/* The form's column heads. */}
          <Box aria-hidden="true" sx={{ display: { xs: 'none', md: 'grid' }, gridTemplateColumns: '40px 64px minmax(0, 1.4fr) minmax(0, 1fr) 132px', gap: 2, px: 1.5, py: 1, bgcolor: CHROME.bar, color: CHROME.text, fontSize: '0.75rem', fontWeight: 800 }}>
            <span>No.</span>
            <span />
            <span>Article</span>
            <span>Identifiers · acquired</span>
            <Box component="span" sx={{ textAlign: 'right' }}>
              Value
            </Box>
          </Box>
          <Box component="ul" aria-label="Things in the report" sx={{ m: 0, p: 0 }}>
            {rows.things.map((thing, i) => (
              <ReportRow key={thing.id} thing={thing} index={i} />
            ))}
          </Box>
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
