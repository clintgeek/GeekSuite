import React from 'react';
import { Dialog, DialogTitle, DialogContent } from '@mui/material';
import MatchCandidateList from './MatchCandidateList.jsx';

const SwapDialog = ({ open, candidates, onClose, onSelect }) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Select a match</DialogTitle>
      <DialogContent>
        <MatchCandidateList candidates={candidates} onSelect={onSelect} />
      </DialogContent>
    </Dialog>
  );
};

export default SwapDialog;


