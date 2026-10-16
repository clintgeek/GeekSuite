import React from 'react';
import { Box } from '@mui/material';

/**
 * Where Save goes in a PremiumDialog, so it sits under the thumb on a phone.
 *
 * Full-screen (phones), the shared dialog puts its primary action top-right in
 * the header — the hardest corner to reach one-handed (review Phase 1.7). Here
 * the button goes in the dialog's footer bar instead, full width, above the
 * safe area; the header's ✕ is the cancel. In a window (tablet and up) the
 * dialog keeps its usual header/footer pair.
 *
 * Returns the props to spread onto PremiumDialog.
 *
 * @param {{ fullScreen: boolean, save: React.ReactElement, cancel?: React.ReactNode }} args
 *   `save` is the Save button; it is cloned full width and large on a phone.
 */
export function thumbSaveProps({ fullScreen, save, cancel }) {
  if (!fullScreen) return { primaryAction: save, secondaryAction: cancel };
  return {
    // `actions` with no `secondaryAction` is PremiumDialog's "keep the footer
    // on mobile" path.
    actions: (
      <Box sx={{ flex: 1, display: 'flex' }} data-testid="thumb-save">
        {React.cloneElement(save, { fullWidth: true, size: 'large', sx: { minHeight: 48, ...save.props.sx } })}
      </Box>
    ),
  };
}

export default thumbSaveProps;
