/**
 * InstrumentStrip — the AIGeek page's dial panel, above the section nav.
 *
 * The same one round trip the page already makes (`GET /api/ai/status`) read
 * as instruments before it is read as a list: the paid governor's day on a
 * dial, the catalog's last probe on another, and a lamp per provider. It
 * answers "is the AI side healthy" from across the room; the sections below
 * still carry every detail and every action.
 */
import { Box, Card, CardContent } from '@mui/material';
import Gauge from '../../signalbox/Gauge';
import { StatusLamp } from '../../signalbox/Lamp';
import { Dymo } from '../../signalbox/Labels';
import { catalogReading, formatDollars, providerLamp, spendReading } from '../../signalbox/readings';

const SPEND_WORD = { ok: 'within cap', warn: 'nearing cap', fault: 'at cap' };
const CATALOG_WORD = { ok: 'healthy', warn: 'thinning', fault: 'failing' };

export default function InstrumentStrip({ status }) {
  const spend = spendReading(status?.spend);
  const catalog = catalogReading(status?.catalog);
  const byProvider = status?.catalog?.byProvider || {};
  const labels = status?.catalog?.labels || {};
  const providers = Object.keys(byProvider);
  const pct = (f) => `${Math.round((f || 0) * 100)}%`;

  return (
    <Card component="section" aria-label="AI instruments" sx={{ mb: 2 }}>
      <CardContent>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: '220px 220px 1fr' }, gap: { xs: 2, md: 3 }, alignItems: 'start' }}>
          <Gauge
            label="Paid today"
            value={spend?.value}
            max={spend?.max}
            fraction={spend?.fraction ?? null}
            zone={spend?.zone}
            zoneWord={SPEND_WORD[spend?.zone]}
            readout={formatDollars(spend?.value)}
            caption={`of ${formatDollars(spend?.max)} daily cap`}
            valueText={spend ? `${formatDollars(spend.value)} of a ${formatDollars(spend.max)} daily cap, ${pct(spend.fraction)}` : ''}
            maxLabel={spend?.max ? formatDollars(spend.max) : undefined}
          />
          <Gauge
            label="Free alive"
            value={catalog?.value}
            max={catalog?.max}
            fraction={catalog?.fraction ?? null}
            zone={catalog?.zone}
            zoneWord={CATALOG_WORD[catalog?.zone]}
            readout={catalog ? `${catalog.value} / ${catalog.max ?? 0}` : ''}
            caption="in the last probe"
            valueText={catalog ? `${catalog.value} of ${catalog.max ?? 0} free models answered the last probe` : ''}
            zones={{ warn: 0.5, fault: 0.75, invert: true }}
            maxLabel={catalog?.max ? String(catalog.max) : undefined}
          />
          <Box sx={{ gridColumn: { xs: '1 / -1', md: 'auto' }, minWidth: 0 }}>
            <Dymo sx={{ mb: 1.5 }}>Provider lamps</Dymo>
            {providers.length === 0 ? (
              <Box sx={{ color: 'text.secondary', fontSize: '0.8125rem' }}>No provider readings yet.</Box>
            ) : (
              <Box component="ul" sx={{ m: 0, p: 0, display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25 }}>
                {providers.map((id) => {
                  const lamp = providerLamp(id, byProvider, status?.attention);
                  return (
                    <Box component="li" key={id} sx={{ listStyle: 'none', minWidth: 0 }}>
                      <StatusLamp state={lamp.state} label={labels[id] || id} word={lamp.word} dense />
                    </Box>
                  );
                })}
              </Box>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
