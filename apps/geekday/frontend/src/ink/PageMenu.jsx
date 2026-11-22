/**
 * PageMenu.jsx — the day page's paper and its template, chosen separately.
 *
 *   Paper      Ruled / Dot grid / Grid: the background, all the way down.
 *   Template   No template / Schedule / Top three / Meeting / Cornell: a
 *              white sheet printed into the drawing. "No template" takes it
 *              off again.
 *
 * And "Use for new days", which makes the page on screen (its paper and its
 * template, together) this device's default. The menu stays open after a
 * choice, so a page can be tried and then made the default without opening
 * it again.
 */
import React from 'react';
import { Box, Divider, ListSubheader, Menu, MenuItem, Typography } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import { PaperChip, SheetChip } from './PagePaper';
import { NO_SHEET, PAPER_CHOICES, RULED, SHEET_CHOICES, paperChoiceFor, sheetChoiceFor } from './pageTemplate';

const itemSx = {
  minHeight: 56,
  gap: 1.5,
  py: 0.75,
  whiteSpace: 'normal',
  '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
};

const headingSx = {
  bgcolor: 'transparent',
  color: 'text.secondary',
  fontSize: '0.75rem',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  lineHeight: '28px',
  pt: 0.5,
};

function Choice({ choice, checked, testId, group, chip, onClick }) {
  return (
    <MenuItem
      role="menuitemradio"
      aria-checked={checked ? 'true' : 'false'}
      aria-label={`${group}: ${choice.label}. ${choice.description}`}
      selected={checked}
      data-testid={testId}
      onClick={onClick}
      sx={itemSx}
    >
      {chip}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: '1rem', fontWeight: 600, lineHeight: 1.3 }}>{choice.label}</Typography>
        <Typography sx={{ fontSize: '0.8125rem', lineHeight: 1.3, color: 'text.secondary' }}>{choice.description}</Typography>
      </Box>
      {checked ? <CheckIcon fontSize="small" aria-hidden sx={{ color: 'primary.main', flex: 'none' }} /> : null}
    </MenuItem>
  );
}

/** "Schedule on Dot grid", "Ruled", "Meeting on Ruled". */
const pageName = (paper, sheet) => {
  const paperLabel = paperChoiceFor(paper).label;
  return sheet && sheet !== NO_SHEET ? `${sheetChoiceFor(sheet).label} on ${paperLabel}` : paperLabel;
};

/**
 * @param {object} props
 * @param {Element|null} props.anchorEl      the Page button; null closes the menu
 * @param {() => void} props.onClose
 * @param {string} props.paper               the paper on screen (one of PAPER_CHOICES' ids)
 * @param {string} props.sheet               the template on screen, placed or previewed (one of SHEET_CHOICES' ids, or an id this build does not know)
 * @param {{paper: string, sheet: string}} props.deviceDefault  this device's page for new days
 * @param {(id: string) => void} props.onPaper
 * @param {(id: string) => void} props.onSheet
 * @param {(page: {paper: string, sheet: string}) => void} props.onDeviceDefault
 */
export default function PageMenu({ anchorEl, onClose, paper, sheet, deviceDefault, onPaper, onSheet, onDeviceDefault }) {
  // A template this build does not know cannot be a default.
  const knownSheet = sheetChoiceFor(sheet).id === sheet ? sheet : NO_SHEET;
  const isDefault = paper === deviceDefault.paper && knownSheet === deviceDefault.sheet;
  const name = pageName(paper, knownSheet);
  return (
    <Menu
      anchorEl={anchorEl}
      open={Boolean(anchorEl)}
      onClose={onClose}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      MenuListProps={{ 'aria-label': 'Page', dense: false }}
      slotProps={{ paper: { 'data-testid': 'ink-page-menu', sx: { mt: -1, width: 320, maxWidth: 'calc(100vw - 16px)' } } }}
    >
      <ListSubheader component="li" role="presentation" disableSticky data-testid="ink-page-heading-paper" sx={headingSx}>Paper</ListSubheader>
      {PAPER_CHOICES.map((choice) => (
        <Choice
          key={`paper-${choice.id}`}
          choice={choice}
          group="Paper"
          checked={choice.id === paper}
          testId={`ink-page-${choice.id}`}
          chip={<PaperChip id={choice.id} />}
          onClick={() => onPaper(choice.id)}
        />
      ))}
      <Divider component="li" role="separator" />
      <ListSubheader component="li" role="presentation" disableSticky data-testid="ink-page-heading-template" sx={headingSx}>Template</ListSubheader>
      {SHEET_CHOICES.map((choice) => (
        <Choice
          key={`sheet-${choice.id}`}
          choice={choice}
          group="Template"
          checked={choice.id === (sheet || NO_SHEET)}
          testId={`ink-sheet-${choice.id}`}
          chip={<SheetChip id={choice.id} />}
          onClick={() => onSheet(choice.id)}
        />
      ))}
      <Divider component="li" role="separator" />
      <MenuItem
        role="menuitemcheckbox"
        aria-checked={isDefault ? 'true' : 'false'}
        data-testid="ink-page-default"
        // Turning it off goes back to a plain ruled page; when that is already the default there is nothing to turn off.
        onClick={() => onDeviceDefault(isDefault ? { paper: RULED, sheet: NO_SHEET } : { paper, sheet: knownSheet })}
        sx={itemSx}
      >
        <Box aria-hidden sx={{ width: 44, display: 'grid', placeItems: 'center', flex: 'none', color: isDefault ? 'primary.main' : 'text.secondary' }}>
          {isDefault ? <CheckBoxIcon /> : <CheckBoxOutlineBlankIcon />}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 600, lineHeight: 1.3 }}>Use for new days</Typography>
          <Typography sx={{ fontSize: '0.8125rem', lineHeight: 1.3, color: 'text.secondary' }}>
            {isDefault ? `New days open as ${name} on this device` : `Open new days as ${name} on this device`}
          </Typography>
        </Box>
      </MenuItem>
    </Menu>
  );
}
