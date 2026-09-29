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
 * No orange text anywhere here (the Label Maker rule): checks are ink
 * (primary.main), not safety orange.
 */
import React, { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { CheckCircle as DoneIcon, RadioButtonUnchecked as TodoIcon } from '@mui/icons-material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { DISPLAY_FONT } from '../theme/theme';
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

function StepRow({ step, action }) {
  const Icon = step.done ? DoneIcon : TodoIcon;
  return (
    <Box component="li" data-testid={`checklist-step-${step.key}`} data-done={step.done ? 'true' : 'false'} sx={{ listStyle: 'none', display: 'flex', alignItems: 'flex-start', gap: 1.25, minHeight: 44, py: 0.5 }}>
      <Icon aria-hidden="true" sx={{ fontSize: 20, color: step.done ? 'primary.main' : 'text.secondary', flexShrink: 0, mt: '10px' }} />
      {/* flex-wrap: a long label (the labels step) and a multi-button action both
          claiming the same line would squeeze — the action drops to its own
          line under the label instead, rather than the two visually overlapping. */}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1, rowGap: 0.5, py: '10px' }}>
        <Typography sx={{ flex: '1 1 auto', minWidth: 180, fontSize: '0.9375rem', color: step.done ? 'text.secondary' : 'text.primary', textDecoration: step.done ? 'line-through' : 'none' }}>
          {step.label}
        </Typography>
        {!step.done && action ? (
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
    <Box data-testid="onboarding-checklist" sx={{ mb: 3, border: 1, borderColor: 'divider', borderRadius: 3, bgcolor: 'background.card', p: { xs: 1.5, md: 2 } }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, mb: 0.5 }}>
        <Typography component="h2" sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: '1.0625rem' }}>
          Getting started
        </Typography>
        <Button onClick={hide} data-testid="checklist-hide" sx={{ color: 'text.secondary', minHeight: 44 }}>
          Hide this list
        </Button>
      </Box>
      <Box component="ul" sx={{ m: 0, p: 0 }}>
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
