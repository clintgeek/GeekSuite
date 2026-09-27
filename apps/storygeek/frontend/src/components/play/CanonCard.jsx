import { Box, Typography, alpha } from '@mui/material';
import { ThemeProvider, useTheme } from '@mui/material/styles';
import Narration from '../Narration';
import WaxSeal from '../primitives/WaxSeal';
import Tag from '../primitives/Tag';
import { fonts, getScrollTheme } from '../../theme/theme';

/**
 * CanonCard — the answer to "what do we know?" straight from the engine's
 * record, drawn as a lore scroll. The fact list with its wax-seal provenance
 * IS the answer; the summary prose on top is generated under a report-only
 * contract (DOCS/CONTINUITY.md, "Canon queries").
 *
 * Distinct from narration on purpose: narration is the page of the tale; this
 * is the archive speaking. It renders under the parchment scroll theme in
 * both modes, so every ink inside it is a day ink measured on the scroll.
 */
function Rolled({ top }) {
  return (
    <Box aria-hidden="true" sx={{
      height: 14, mx: -1, borderRadius: '7px',
      background: 'linear-gradient(180deg, #c9ae78 0%, #f2e4c0 45%, #b8995e 100%)',
      boxShadow: top ? '0 2px 4px rgba(60,30,10,0.35)' : '0 -2px 4px rgba(60,30,10,0.25)',
      position: 'relative', zIndex: 1,
    }} />
  );
}

function ScrollBody({ canon }) {
  const theme = useTheme();
  const c = theme.palette.candle;
  const label = {
    fontFamily: fonts.ui, fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.14em',
    textTransform: 'uppercase', color: c.accentLabel,
  };

  return (
    <Box sx={{
      px: { xs: 2, sm: 3 }, py: { xs: 2, sm: 2.5 },
      backgroundColor: c.paper,
      backgroundImage: `radial-gradient(ellipse at 50% 0%, ${alpha('#fff8e0', 0.6)} 0%, transparent 60%), linear-gradient(90deg, ${alpha('#8a6a3a', 0.12)} 0%, transparent 6%, transparent 94%, ${alpha('#8a6a3a', 0.12)} 100%)`,
      color: c.ink,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap', mb: 1.25 }}>
        <Typography component="h3" sx={{ fontFamily: fonts.display, fontWeight: 700, fontSize: '1.05rem', letterSpacing: '0.06em', color: c.ink }}>
          From the Record
        </Typography>
        <Typography component="span" sx={label}>Canon</Typography>
      </Box>

      {canon.summary && (
        <Narration content={canon.summary} sx={{ mb: 1.75, fontSize: '1rem', lineHeight: 1.65 }} />
      )}

      {canon.entities?.length > 0 && (
        <Box sx={{ mb: 1.75 }}>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            {canon.entities.map((e, i) => (
              <Box key={i} component="span" sx={{
                display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.25,
                border: `1px solid ${alpha(c.ink, 0.28)}`, borderRadius: '3px',
                fontFamily: fonts.ui, fontSize: '0.875rem', color: c.ink,
              }}>
                <b>{e.name}</b>
                <span style={{ color: c.inkSoft }}>
                  {e.kind === 'character'
                    ? `${e.status}${e.locationName ? ` · at ${e.locationName}` : ''}`
                    : e.state}
                </span>
              </Box>
            ))}
          </Box>
          {/* What each character is recorded as knowing (player-visible only) */}
          {canon.entities.filter((e) => e.knows?.length > 0).map((e, i) => (
            <Box key={`k${i}`} sx={{ mt: 1.25, pl: 1.25, borderLeft: `2px solid ${alpha(c.accentLabel, 0.45)}` }}>
              <Typography sx={label}>{e.name} knows · as recorded</Typography>
              {e.knows.map((k, j) => (
                <Typography key={j} sx={{ fontSize: '0.9375rem', color: c.inkSoft, lineHeight: 1.5 }}>
                  {k.text}{' '}
                  <Typography component="span" sx={{ fontFamily: fonts.ui, fontSize: '0.8125rem', color: c.inkFaint }}>
                    ({k.via}{k.turn != null ? ` · T${k.turn}` : ''})
                  </Typography>
                </Typography>
              ))}
            </Box>
          ))}
        </Box>
      )}

      {canon.facts?.length > 0 && (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, mb: 1.5 }}>
          {canon.facts.map((f, i) => (
            <Box component="li" key={i} sx={{
              display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '9.5rem 1fr' }, gap: { xs: 0.5, sm: 1.5 },
              alignItems: 'start', py: 1,
              borderTop: i === 0 ? 'none' : `1px dashed ${alpha(c.ink, 0.2)}`,
            }}>
              <WaxSeal source={f.source} turn={f.turn} />
              <Typography sx={{ fontSize: '1rem', lineHeight: 1.5, color: c.ink }}>
                {f.text}
                {f.visibility === 'secret' && <Tag tone="warn" sx={{ ml: 1 }}>secret</Tag>}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      {canon.threads?.length > 0 && (
        <Box sx={{ mb: 1.5 }}>
          <Typography sx={{ ...label, mb: 0.5 }}>Threads</Typography>
          {canon.threads.map((t, i) => (
            <Typography key={i} sx={{ fontSize: '0.9375rem', color: c.inkSoft, lineHeight: 1.5 }}>
              <b style={{ color: c.ink }}>{t.name}</b> <span>({t.status})</span> — {t.description}
            </Typography>
          ))}
        </Box>
      )}

      <Typography sx={{
        fontStyle: 'italic', fontSize: '0.9375rem', color: c.inkSoft, textAlign: 'center',
        pt: 1.25, borderTop: `1px solid ${alpha(c.ink, 0.2)}`,
      }}>
        {canon.note}
      </Typography>
    </Box>
  );
}

export default function CanonCard({ canon }) {
  return (
    <Box
      className="fade-in-up"
      role="group"
      aria-label="Canon, from the record"
      sx={{ my: 3, mx: { xs: 0, sm: 1 }, filter: 'drop-shadow(0 6px 14px rgba(20,8,4,0.35))' }}
    >
      <ThemeProvider theme={getScrollTheme()}>
        <Rolled top />
        <ScrollBody canon={canon} />
        <Rolled />
      </ThemeProvider>
    </Box>
  );
}
