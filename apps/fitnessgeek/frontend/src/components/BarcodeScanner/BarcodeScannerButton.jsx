import React from 'react';
import { IconButton, Tooltip } from '@mui/material';
import { QrCodeScanner as BarcodeIcon } from '@mui/icons-material';

const BarcodeScannerButton = ({ onClick, disabled = false, size = 'small', color = 'primary' }) => {
  return (
    <Tooltip title="Scan Barcode">
      <IconButton
        onClick={onClick}
        disabled={disabled}
        size={size}
        sx={{ color: `${color}.main` }}
      >
        <BarcodeIcon />
      </IconButton>
    </Tooltip>
  );
};

export default BarcodeScannerButton;