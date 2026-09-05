import React from 'react';
import PremiumDialog from '../primitives/PremiumDialog.jsx';
import MatchCandidateList from './MatchCandidateList.jsx';

const SwapDialog = ({ open, candidates, onClose, onSelect }) => {
  return (
    <PremiumDialog open={open} onClose={onClose} eyebrow="Swap" title="Select a match" maxWidth="sm">
      <MatchCandidateList candidates={candidates} onSelect={onSelect} />
    </PremiumDialog>
  );
};

export default SwapDialog;


