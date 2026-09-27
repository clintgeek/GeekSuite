/**
 * Gauge — an analogue dial for one real reading against one real ceiling.
 *
 * The needle sweeps up from zero when the reading arrives and swings (with a
 * little overshoot, like a damped movement) when it changes. Under reduced
 * motion it is simply where it belongs.
 *
 * Accessibility: the dial is `role="meter"` with the value, the maximum and a
 * sentence (`valueText`) a screen reader can speak; the SVG inside is hidden.
 * Sighted readers get the same sentence as a digital readout under the dial
 * and the zone as a word beside a shaped lamp, so nothing rests on the colour
 * of an arc. A reading with no honest maximum renders as "no reading" and a
 * parked needle, never as a number against an invented scale.
 */
import { useEffect, useId, useState } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { Dymo } from './Labels';
import Lamp from './Lamp';
import { needleAngle } from './readings';
import { useReducedMotion } from './motion';

const CX = 100;
const CY = 104;
const R = 82;

/** A point on the dial at fraction `f` (0 = left end, 1 = right end). */
function point(f, radius = R) {
  const a = Math.PI * (1 - f);
  return [CX + radius * Math.cos(a), CY - radius * Math.sin(a)];
}

function arc(from, to, radius = R) {
  const [x1, y1] = point(from, radius);
  const [x2, y2] = point(to, radius);
  // A 180° dial never spans more than half a circle, so never the large arc.
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/**
 * @param {object}  props
 * @param {string}  props.label      what is measured ("Paid spend today")
 * @param {number}  props.value      the reading
 * @param {number?} props.max        the ceiling, or null when there is none
 * @param {number?} props.fraction   value/max, 0…1, or null
 * @param {string}  props.zone       LAMP state for the zone the reading is in
 * @param {string}  props.zoneWord   the zone in words ("within cap")
 * @param {string}  props.readout    the digital readout ("$0.0231")
 * @param {string}  props.caption    what the maximum is ("of $0.25/day cap")
 * @param {string}  props.valueText  the whole reading as one sentence
 * @param {object?} props.zones      { warn, fault, invert } or null for none
 * @param {string}  props.minLabel / props.maxLabel  end-of-scale labels
 */
export default function Gauge({
  label,
  value,
  max,
  fraction,
  zone,
  zoneWord,
  readout,
  caption,
  valueText,
  zones = { warn: 0.6, fault: 0.9, invert: false },
  minLabel = '0',
  maxLabel,
}) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const labelId = useId();
  const { dial } = theme.palette.box;
  const hasReading = fraction !== null && fraction !== undefined;

  // Sweep up from the stop on first reading; reduced motion lands directly.
  const target = needleAngle(hasReading ? fraction : null);
  const [angle, setAngle] = useState(reduced ? target : -90);
  useEffect(() => {
    if (reduced) {
      setAngle(target);
      return undefined;
    }
    const raf = requestAnimationFrame(() => setAngle(target));
    return () => cancelAnimationFrame(raf);
  }, [target, reduced]);

  const ticks = Array.from({ length: 11 }, (_, i) => i / 10);
  const zoneArcs = [];
  if (zones) {
    const { warn = 0.6, fault = 0.9, invert = false } = zones;
    if (invert) {
      zoneArcs.push([0, 1 - fault, dial.zoneFault], [1 - fault, 1 - warn, dial.zoneWarn], [1 - warn, 1, dial.zoneOk]);
    } else {
      zoneArcs.push([0, warn, dial.zoneOk], [warn, fault, dial.zoneWarn], [fault, 1, dial.zoneFault]);
    }
  }

  const meterProps = hasReading
    ? {
      role: 'meter',
      'aria-valuemin': 0,
      'aria-valuemax': Number(max) || 1,
      'aria-valuenow': Math.min(Number(value) || 0, Number(max) || 1),
      'aria-valuetext': valueText,
      'aria-labelledby': labelId,
    }
    : { role: 'img', 'aria-label': `${label}: no reading` };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
        minWidth: 0,
        textAlign: 'center',
      }}
    >
      <Dymo id={labelId}>{label}</Dymo>
      <Box
        {...meterProps}
        sx={{
          width: '100%',
          maxWidth: 240,
          aspectRatio: '200 / 124',
          borderRadius: '120px 120px 12px 12px',
          p: '6px',
          background: theme.palette.mode === 'light'
            ? 'linear-gradient(180deg, #b9c0c6, #737b85)'
            : 'linear-gradient(180deg, #5d6670, #1f2328)',
          boxShadow: '0 2px 4px rgba(0,0,0,0.35)',
        }}
      >
        <Box
          component="svg"
          viewBox="0 0 200 124"
          aria-hidden="true"
          focusable="false"
          sx={{ display: 'block', width: '100%', height: '100%', borderRadius: '114px 114px 8px 8px', bgcolor: dial.face }}
        >
          {zoneArcs.map(([from, to, color]) => (
            <path key={`${from}-${to}`} d={arc(from, to, R - 6)} stroke={color} strokeWidth="7" fill="none" />
          ))}
          <path d={arc(0, 1, R)} stroke={dial.tick} strokeWidth="1.5" fill="none" />
          {ticks.map((f, i) => {
            const major = i % 5 === 0;
            const [x1, y1] = point(f, R);
            const [x2, y2] = point(f, major ? R - 14 : R - 9);
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={dial.tick} strokeWidth={major ? 2 : 1.25} />;
          })}
          <text x={point(0, R - 22)[0] + 4} y={CY - 2} fill={dial.ink} fontSize="11" fontFamily={theme.typography.fontFamilyMono} textAnchor="start">
            {minLabel}
          </text>
          {maxLabel && (
            <text x={point(1, R - 22)[0] - 4} y={CY - 2} fill={dial.ink} fontSize="11" fontFamily={theme.typography.fontFamilyMono} textAnchor="end">
              {maxLabel}
            </text>
          )}
          <g
            style={{
              transform: `rotate(${angle}deg)`,
              transformOrigin: `${CX}px ${CY}px`,
              transition: 'transform 1100ms cubic-bezier(.34,1.45,.64,1)',
            }}
          >
            <path d={`M ${CX - 3} ${CY} L ${CX} ${CY - (R - 12)} L ${CX + 3} ${CY} Z`} fill={dial.needle} />
          </g>
          <circle cx={CX} cy={CY} r="7" fill={dial.hub} />
          <circle cx={CX} cy={CY} r="2.5" fill={dial.face} />
        </Box>
      </Box>

      <Box
        sx={{
          px: 1.5,
          py: 0.5,
          borderRadius: '3px',
          bgcolor: theme.palette.box.tape.black,
          color: theme.palette.box.tape.ink,
          fontFamily: 'fontFamilyMono',
          fontWeight: 700,
          fontSize: '1.05rem',
          letterSpacing: '0.04em',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.7)',
          minWidth: 96,
        }}
      >
        {hasReading ? readout : '—'}
      </Box>
      <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.35 }}>
        {hasReading ? caption : 'no reading yet'}
      </Typography>
      {hasReading && zoneWord && (
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
          <Lamp state={zone} size={12} />
          <Typography component="span" sx={{ fontFamily: 'fontFamilyMono', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.primary' }}>
            {zoneWord}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
