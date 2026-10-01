/**
 * A quiet first-run checklist on Attention (DOCS/THINGGEEK_PLAN.md), for a
 * household that is still getting its inventory going. It sits ABOVE the
 * overdue/due-soon groups and the ongoing "Gaps in the record" cards, and
 * retires itself once the ramp-up is done — the Gaps cards keep nagging
 * about a missing ID-plate photo forever; this one does not.
 *
 * "New-ish" (whether the CARD shows at all) is fewer than 10 things, or
 * fewer than 2 locations: the two "just getting started" milestones. Once
 * past both, the card stops appearing even if a step below is still
 * unchecked — that's what "Hide this list" is for anyway, and what the
 * Gaps cards are for on an ID-plate photo specifically. (The literal reading
 * "or any step incomplete" was rejected: it would make the card immortal —
 * a mature household nearly always has ONE thing without an ID-plate photo
 * — which defeats "first-run".)
 *
 * Each STEP's own done-ness, though, is exactly the thing it names:
 *   1. Add your rooms        — done at ≥2 locations
 *   2. Walk one room         — done at ≥5 things (any kind but a location)
 *   3. Photograph ID plates  — done when there are items and `missingIdPlate`
 *      is 0 (an empty inventory is not "done"). That count
 *      (GraphQL thingAttention, apps/basegeek's resolvers.js) is already
 *      scoped to types with an identifier field (serial/VIN/hull/plate) —
 *      exactly "firearm/vehicle/electronics/boat/etc., not value", so no new
 *      threshold is invented here.
 *   4. Print labels for your totes — can't be known from data, so it's
 *      dismissible ("Done" / "Not for us"), stored in localStorage.
 *
 * "Hide this list" retires the whole card the same way, also localStorage.
 *
 * Storage Yard: "Getting started" — the sheet on the rental counter's
 * clipboard: a printed form (white stock) under a black clip, square check
 * boxes, and a finished step stamped "Done" in orange with black ink.
 */
import React, { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { CHROME, DISPLAY_FONT, LIVERY, STENCIL_FONT } from '../theme/theme';
import { libraryLinkWith } from '../utils/libraryFilter';
import { readPref, writePref } from '../utils/storage';

export const HIDE_KEY = 'thinggeek.checklistHidden';
export const LABELS_KEY = 'thinggeek.labelsChecklist';

/** Whether the card shows at all — see the file note on why step 3 isn't part of this gate. */
export function isNewIsh({ locationsCount = 0, itemsCount = 0 } = {}) {
  return itemsCount < 10 || locationsCount < 2;
}

/** The four steps and their done-ness. Pure, so the logic is tested without mounting anything. */
export function checklistSteps({ locationsCount = 0, itemsCount = 0, missingIdPlate = 0, labelsAnswer = null } = {}) {
  return [
    { key: 'rooms', label: 'Add your rooms', done: locationsCount >= 2 },
    { key: 'walk', label: 'Walk one room', done: itemsCount >= 5 },
    // Nothing missing only counts once there's something to photograph: an
    // empty inventory has "0 missing" too, and must not tick itself off.
    { key: 'id-plate', label: 'Photograph ID plates on valuables', done: itemsCount > 0 && missingIdPlate === 0 },
    { key: 'labels', label: 'Print labels for your totes', done: Boolean(labelsAnswer) },
  ];
}

/** A square check box, printed on the form: ticked in black when done. */
export function CheckSquare({ done, sx }) {
  return (
    <Box
      component="span"
      aria-hidden="true"
      sx={{ width: 20, height: 20, flexShrink: 0, border: '2px solid', borderColor: 'text.primary', borderRadius: '2px', display: 'grid', placeItems: 'center', fontSize: '0.875rem', fontWeight: 900, lineHeight: 1, color: 'text.primary', ...sx }}
    >
      {done ? '✓' : ''}
    </Box>
  );
}

/** The orange "Done" stamp on a finished step (real text). */
export function DoneStamp() {
  return (
    <Box component="span" data-testid="done-stamp" sx={{ display: 'inline-flex', alignItems: 'center', px: 1, height: 24, bgcolor: LIVERY.orange, color: LIVERY.ink, border: `1.5px solid ${LIVERY.ink}`, borderRadius: '2px', fontFamily: STENCIL_FONT, fontSize: '0.8125rem', letterSpacing: '0.08em', transform: 'rotate(-3deg)' }}>
      Done
    </Box>
  );
}

function StepRow({ step, action }) {
  return (
    <Box component="li" data-testid={`checklist-step-${step.key}`} data-done={step.done ? 'true' : 'false'} sx={{ listStyle: 'none', display: 'flex', alignItems: 'flex-start', gap: 1.25, minHeight: 44, py: 0.5, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
      <Box sx={{ height: 44, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <CheckSquare done={step.done} />
      </Box>
      {/* flex-wrap: a long label (the labels step) and a multi-button action both
          claiming the same line would squeeze — the action drops to its own
          line under the label instead, rather than the two visually overlapping. */}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1, rowGap: 0.5, py: 0 }}>
        <Typography sx={{ flex: '1 1 auto', minWidth: 180, minHeight: 44, display: 'flex', alignItems: 'center', fontSize: '0.9375rem', color: step.done ? 'text.secondary' : 'text.primary', textDecoration: step.done ? 'line-through' : 'none' }}>
          {step.label}
        </Typography>
        {step.done ? (
          <DoneStamp />
        ) : action ? (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>{action}</Box>
        ) : null}
      </Box>
    </Box>
  );
}

/**
 * `locationsCount`/`itemsCount` come from the containment tree (already
 * loaded elsewhere — hooks/useThingMeta's useThingTree); `missingIdPlate`
 * from the Attention view's own `useAttention()`. `walkAt`: the id to jump
 * Walk straight into when exactly one place exists (no need to ask).
 */
export default function OnboardingChecklist({ locationsCount, itemsCount, missingIdPlate, walkAt }) {
  const navigate = useNavigate();
  const [labelsAnswer, setLabelsAnswer] = useState(() => readPref(LABELS_KEY, null));
  const [hidden, setHidden] = useState(() => readPref(HIDE_KEY, false));

  if (hidden || !isNewIsh({ locationsCount, itemsCount })) return null;

  const steps = checklistSteps({ locationsCount, itemsCount, missingIdPlate, labelsAnswer });

  const hide = () => {
    writePref(HIDE_KEY, true);
    setHidden(true);
  };
  const answerLabels = (value) => {
    writePref(LABELS_KEY, value);
    setLabelsAnswer(value);
  };
  const startWalk = () => navigate(walkAt ? `/walk?at=${encodeURIComponent(walkAt)}` : '/walk');

  return (
    <Box data-testid="onboarding-checklist" component="section" aria-labelledby="checklist-heading" sx={{ position: 'relative', mt: 5, mb: 3, border: 1, borderColor: 'border', borderRadius: '3px', bgcolor: 'background.paper', boxShadow: '0 3px 0 rgba(0,0,0,0.18)' }}>
      {/* The clipboard's clip, holding the sheet. */}
      <Box aria-hidden="true" sx={{ position: 'absolute', top: -9, left: '50%', width: 92, height: 18, ml: '-46px', borderRadius: '4px 4px 2px 2px', bgcolor: CHROME.bar, border: `2px solid ${CHROME.raised}`, boxShadow: 'inset 0 -3px 0 rgba(255,255,255,0.08)' }} />
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, px: { xs: 1.5, md: 2 }, pt: 2, pb: 0.5, borderBottom: '3px solid', borderColor: 'rule.main' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography id="checklist-heading" component="h2" sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: '1.25rem', lineHeight: 1.2 }}>
            Getting started
          </Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>The first-run checklist — four things, then you're set.</Typography>
        </Box>
        <Button onClick={hide} data-testid="checklist-hide" sx={{ color: 'text.secondary', minHeight: 44, flexShrink: 0 }}>
          Hide this list
        </Button>
      </Box>
      <Box component="ul" sx={{ m: 0, px: { xs: 1.5, md: 2 }, pb: 1 }}>
        <StepRow
          step={steps[0]}
          action={
            <Button component={RouterLink} to="/where" size="small" sx={{ color: 'text.primary', minHeight: 44, flexShrink: 0 }}>
              Add a room
            </Button>
          }
        />
        <StepRow
          step={steps[1]}
          action={
            <Button onClick={startWalk} size="small" sx={{ color: 'text.primary', minHeight: 44, flexShrink: 0 }}>
              Walk a room
            </Button>
          }
        />
        <StepRow
          step={steps[2]}
          action={
            <Button component={RouterLink} to={libraryLinkWith('missing', 'id-plate')} size="small" sx={{ color: 'text.primary', minHeight: 44, flexShrink: 0 }}>
              See what's missing
            </Button>
          }
        />
        <StepRow
          step={steps[3]}
          action={
            <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
              <Button component={RouterLink} to="/labels" size="small" sx={{ color: 'text.primary', minHeight: 44 }}>
                Print labels
              </Button>
              <Button data-testid="checklist-labels-done" onClick={() => answerLabels('done')} size="small" sx={{ color: 'text.secondary', minHeight: 44 }}>
                Done
              </Button>
              <Button data-testid="checklist-labels-skip" onClick={() => answerLabels('not-for-us')} size="small" sx={{ color: 'text.secondary', minHeight: 44 }}>
                Not for us
              </Button>
            </Box>
          }
        />
      </Box>
    </Box>
  );
}
