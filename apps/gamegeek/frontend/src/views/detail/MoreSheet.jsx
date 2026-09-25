/** ⋯ More: the less frequent things you do to a game. */
import React from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import {
  DeleteOutline as DeleteIcon,
  EditOutlined as EditIcon,
  ImageOutlined as CoverIcon,
  Inventory2Outlined as CopiesIcon,
  LinkOff as UnlinkIcon,
  ManageSearchOutlined as FindMetadataIcon,
  RefreshOutlined as RefreshMetadataIcon,
} from '@mui/icons-material';
import { GeekSheet } from '@geeksuite/ui';

function Row({ icon, label, hint, onClick, danger }) {
  return (
    <Box component="li" sx={{ listStyle: 'none' }}>
      <ButtonBase
        onClick={onClick}
        sx={{ width: '100%', minHeight: 52, px: 1.5, gap: 1.5, borderRadius: '10px', justifyContent: 'flex-start', textAlign: 'left', '&:hover': { bgcolor: 'action.hover' } }}
      >
        <Box sx={{ color: danger ? 'error.main' : 'text.secondary', display: 'flex' }}>{icon}</Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.9375rem', fontWeight: 500, color: danger ? 'error.main' : 'text.primary' }}>{label}</Typography>
          {hint ? <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{hint}</Typography> : null}
        </Box>
      </ButtonBase>
    </Box>
  );
}

export default function MoreSheet({
  open,
  onClose,
  title,
  onEdit,
  onCover,
  onCopies,
  onFindMetadata,
  onRefreshMetadata,
  onUnlinkMetadata,
  enrichmentStatus,
  onDelete,
}) {
  const pick = (fn) => () => {
    onClose();
    fn();
  };
  return (
    <GeekSheet open={open} onClose={onClose} title="More" description={title}>
      <Box component="ul" sx={{ m: 0, p: 0, pb: 1 }}>
        <Row icon={<EditIcon />} label="Edit details" hint="Title, dates, developers, genres, description" onClick={pick(onEdit)} />
        <Row icon={<CoverIcon />} label="Cover art" hint="Find art, upload your own, or remove it" onClick={pick(onCover)} />
        <Row icon={<CopiesIcon />} label="Copies" hint="Platforms, formats and storefronts we own" onClick={pick(onCopies)} />
        {onFindMetadata ? (
          <Row icon={<FindMetadataIcon />} label="Find metadata…" hint="Pick a match from Steam, IGDB or RAWG" onClick={pick(onFindMetadata)} />
        ) : null}
        {onRefreshMetadata ? (
          <Row icon={<RefreshMetadataIcon />} label="Refresh metadata" hint="Look this game up again now" onClick={pick(onRefreshMetadata)} />
        ) : null}
        {onUnlinkMetadata && enrichmentStatus === 'matched' ? (
          <Row icon={<UnlinkIcon />} label="Wrong match? Unlink" hint="Removes the auto-filled details and cover" onClick={pick(onUnlinkMetadata)} />
        ) : null}
        <Row icon={<DeleteIcon />} label="Delete game" hint="Removes it for the whole household" onClick={pick(onDelete)} danger />
      </Box>
    </GeekSheet>
  );
}
