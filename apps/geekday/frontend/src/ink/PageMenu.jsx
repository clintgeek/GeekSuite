/**
 * PageMenu.jsx — choosing the day's page (DOCS/TEMPLATES_SPEC.md P4).
 *
 * Ruled and the six shared templates, each with a corner of the page as its
 * picture and the current one marked; and "Use for new days", which makes the
 * page on screen this device's default. The menu stays open after a choice,
 * so a page can be tried and then made the default without opening it again.
 */
import React from 'react';
import { Box, Divider, Menu, MenuItem, Typography } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import { PageChip } from './PagePaper';
import { PAGE_CHOICES, RULED, choiceFor } from './pageTemplate';

const itemSx = {
  minHeight: 56,
  gap: 1.5,
  py: 0.75,
  whiteSpace: 'normal',
  '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
};

/**
 * @param {object} props
 * @param {Element|null} props.anchorEl      the Page button; null closes the menu
 * @param {() => void} props.onClose
 * @param {string} props.template            the page on screen (one of PAGE_CHOICES' ids)
 * @param {string} props.deviceDefault       this device's page for new days
 * @param {(id: string) => void} props.onTemplate
 * @param {(id: string) => void} props.onDeviceDefault
 */
export default function PageMenu({ anchorEl, onClose, template, deviceDefault, onTemplate, onDeviceDefault }) {
  const isDefault = template === deviceDefault;
  const current = choiceFor(template);
  return (
    <Menu
      anchorEl={anchorEl}
      open={Boolean(anchorEl)}
      onClose={onClose}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      MenuListProps={{ 'aria-label': 'Page' }}
      slotProps={{ paper: { 'data-testid': 'ink-page-menu', sx: { mt: -1, width: 320, maxWidth: 'calc(100vw - 16px)' } } }}
    >
      {PAGE_CHOICES.map((choice) => {
        const checked = choice.id === template;
        return (
          <MenuItem
            key={choice.id}
            role="menuitemradio"
            aria-checked={checked ? 'true' : 'false'}
            selected={checked}
            data-testid={`ink-page-${choice.id}`}
            onClick={() => onTemplate(choice.id)}
            sx={itemSx}
          >
            <PageChip id={choice.id} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: '1rem', fontWeight: 600, lineHeight: 1.3 }}>{choice.label}</Typography>
              <Typography sx={{ fontSize: '0.8125rem', lineHeight: 1.3, color: 'text.secondary' }}>{choice.description}</Typography>
            </Box>
            {checked ? <CheckIcon fontSize="small" aria-hidden sx={{ color: 'primary.main', flex: 'none' }} /> : null}
          </MenuItem>
        );
      })}
      <Divider component="li" role="separator" />
      <MenuItem
        role="menuitemcheckbox"
        aria-checked={isDefault ? 'true' : 'false'}
        data-testid="ink-page-default"
        // Ruled is the default already when nothing else is: there is nothing to turn off.
        onClick={() => onDeviceDefault(isDefault ? RULED : template)}
        sx={itemSx}
      >
        <Box aria-hidden sx={{ width: 44, display: 'grid', placeItems: 'center', flex: 'none', color: isDefault ? 'primary.main' : 'text.secondary' }}>
          {isDefault ? <CheckBoxIcon /> : <CheckBoxOutlineBlankIcon />}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 600, lineHeight: 1.3 }}>Use for new days</Typography>
          <Typography sx={{ fontSize: '0.8125rem', lineHeight: 1.3, color: 'text.secondary' }}>
            {isDefault ? `New days open as ${current.label} on this device` : `Open new days as ${current.label} on this device`}
          </Typography>
        </Box>
      </MenuItem>
    </Menu>
  );
}
