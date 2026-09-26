/** ⋯ More: the rare things you do to a thing. */
import React from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import { DeleteOutline as TrashIcon, EditOutlined as EditIcon, ReceiptLongOutlined as ReportIcon } from '@mui/icons-material';
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
          <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: danger ? 'error.main' : 'text.primary' }}>{label}</Typography>
          {hint ? <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{hint}</Typography> : null}
        </Box>
      </ButtonBase>
    </Box>
  );
}

export default function MoreSheet({ open, onClose, title, onEdit, onReport, onTrash, trashDays = 30 }) {
  const pick = (fn) => () => {
    onClose();
    fn();
  };
  return (
    <GeekSheet open={open} onClose={onClose} title="More" description={title}>
      <Box component="ul" sx={{ m: 0, p: 0, pb: 1 }}>
        <Row icon={<EditIcon />} label="Edit everything" hint="Fields, dates, value, accessories, photos and documents" onClick={pick(onEdit)} />
        <Row icon={<ReportIcon />} label="Insurance report" hint="Print or export the whole ledger" onClick={pick(onReport)} />
        <Row icon={<TrashIcon />} label="Move to Trash" hint={`Kept for ${trashDays} days, then purged with its files`} onClick={pick(onTrash)} danger />
      </Box>
    </GeekSheet>
  );
}
