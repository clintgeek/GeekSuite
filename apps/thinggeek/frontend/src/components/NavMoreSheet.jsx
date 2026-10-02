/**
 * The phone's More tab: everything that isn't a tab. Types, the insurance
 * report, the Attic (family documents, locked), the Trash, the caller's saved views and Settings — the one place
 * each of them lives on a phone (the avatar menu keeps only the account:
 * theme and sign out).
 */
import React from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import {
  CategoryOutlined as TypesIcon,
  ChevronRight as GoIcon,
  DeleteOutline as TrashIcon,
  LockOutlined as AtticIcon,
  ReceiptLongOutlined as InsuranceIcon,
  SettingsOutlined as SettingsIcon,
} from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { GeekSheet } from '@geeksuite/ui';
import { SavedViews } from '@geeksuite/collection';
import { useSavedViews } from '../hooks/useSavedViews';

export const MORE_LINKS = [
  { id: 'types', label: 'Types', hint: 'What each kind of thing asks for', to: '/types', icon: <TypesIcon /> },
  { id: 'insurance', label: 'Insurance report', hint: 'Print it, or export a CSV', to: '/insurance', icon: <InsuranceIcon /> },
  { id: 'attic', label: 'The Attic', hint: 'Family documents, under lock', to: '/attic', icon: <AtticIcon /> },
  { id: 'trash', label: 'Trash', hint: 'Kept for a while, then purged', to: '/trash', icon: <TrashIcon /> },
  { id: 'settings', label: 'Settings', hint: 'Appearance and account', to: '/settings', icon: <SettingsIcon /> },
];

function LinkRow({ item, onPick }) {
  return (
    <Box component="li" sx={{ listStyle: 'none' }}>
      <ButtonBase
        component={RouterLink}
        to={item.to}
        onClick={onPick}
        data-more={item.id}
        sx={{
          width: '100%',
          minHeight: 56,
          px: 1.5,
          gap: 1.5,
          borderRadius: '6px',
          justifyContent: 'flex-start',
          textAlign: 'left',
          color: 'text.primary',
          textDecoration: 'none',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <Box sx={{ color: 'text.secondary', display: 'flex' }}>{item.icon}</Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: 'text.primary' }}>{item.label}</Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>{item.hint}</Typography>
        </Box>
        <GoIcon aria-hidden="true" sx={{ color: 'text.secondary' }} />
      </ButtonBase>
    </Box>
  );
}

export default function NavMoreSheet({ open, onClose }) {
  const { views, activeView, hrefFor, remove } = useSavedViews();
  return (
    <GeekSheet open={open} onClose={onClose} title="More" bodySx={{ pb: 'calc(16px + env(safe-area-inset-bottom))' }}>
      <Box component="ul" aria-label="More pages" data-testid="nav-more" sx={{ m: 0, p: 0 }}>
        {MORE_LINKS.map((item) => (
          <LinkRow key={item.id} item={item} onPick={onClose} />
        ))}
      </Box>
      <Box
        onClick={(e) => {
          // A tap on a saved view navigates; close the sheet behind it (the ⋯ menu stays).
          if (e.target.closest?.('a[href]')) onClose();
        }}
        sx={{
          mt: 1.5,
          pt: 1.5,
          borderTop: 1,
          borderColor: 'divider',
          '& [data-geek-sidebar="section-label"]': { textTransform: 'none', letterSpacing: '0.01em', fontSize: '0.875rem', fontWeight: 700, color: 'text.primary' },
          '& .MuiListItemButton-root': { minHeight: 48, borderRadius: '6px' },
        }}
      >
        {views.length ? (
          <SavedViews views={views} activeId={activeView?.id ?? null} hrefFor={hrefFor} onDelete={remove} />
        ) : (
          <Typography sx={{ px: 1.5, fontSize: '0.875rem', color: 'text.secondary' }}>
            Saved views show up here. Filter the library, then save the view.
          </Typography>
        )}
      </Box>
    </GeekSheet>
  );
}
