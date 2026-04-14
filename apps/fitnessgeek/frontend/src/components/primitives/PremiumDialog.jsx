import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogActions,
  Box,
  IconButton,
  Typography,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import SectionLabel from './SectionLabel.jsx';
import DisplayHeading from './DisplayHeading.jsx';

/**
 * PremiumDialog — the canonical FitnessGeek dialog wrapper.
 *
 * Locks down the header treatment, paper radius, action bar, and close
 * button placement so every dialog in the app feels like the same product.
 *
 * Props:
 *   open, onClose, maxWidth, fullWidth — passed through to MUI Dialog
 *   eyebrow                            — small uppercase tick label
 *   title                              — DM Serif Display heading
 *   subtitle                           — optional muted body copy
 *   icon                               — optional icon component shown in header
 *   actions                            — node rendered in DialogActions footer
 *   children                           — DialogContent body
 *   contentSx                          — sx overrides on the content area
 *   disableClose                       — hide the X button (for required-action dialogs)
 *
 * Use it like:
 *   <PremiumDialog
 *     open={open}
 *     onClose={onClose}
 *     eyebrow="Confirm"
 *     title="Delete this meal?"
 *     subtitle="This can't be undone."
 *     actions={
 *       <>
 *         <Button onClick={onClose}>Cancel</Button>
 *         <Button variant="contained" color="error" onClick={confirm}>Delete</Button>
 *       </>
 *     }
 *   >
 *     {body content}
 *   </PremiumDialog>
 */
const PremiumDialog = ({
  open,
  onClose,
  maxWidth = 'sm',
  fullWidth = true,
  eyebrow,
  title,
  subtitle,
  icon: Icon,
  actions,
  children,
  contentSx,
  disableClose = false,
  ...rest
}) => {
  const theme = useTheme();

  return (
    <Dialog
      open={open}
      onClose={disableClose ? undefined : onClose}
      maxWidth={maxWidth}
      fullWidth={fullWidth}
      PaperProps={{
        sx: {
          borderRadius: { xs: 0, sm: 3 },
          margin: { xs: 0, sm: 2 },
          maxHeight: { xs: '100vh', sm: '92vh' },
          width: { xs: '100%', sm: 'auto' },
          border: `1px solid ${theme.palette.divider}`,
          backgroundColor: theme.palette.background.paper,
          backgroundImage: 'none',
          boxShadow: theme.palette.mode === 'dark'
            ? '0 24px 64px -16px rgba(0, 0, 0, 0.7)'
            : '0 24px 64px -20px rgba(28, 25, 23, 0.25)',
          overflow: 'hidden',
        },
      }}
      {...rest}
    >
      {/* Header */}
      {(title || eyebrow || Icon) && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 2,
            px: { xs: 3, sm: 3.5 },
            pt: { xs: 3, sm: 3.5 },
            pb: { xs: 2, sm: 2.5 },
            borderBottom: `1px dashed ${theme.palette.divider}`,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75, flex: 1, minWidth: 0 }}>
            {Icon && (
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  backgroundColor: theme.palette.primary.main,
                  color: theme.palette.primary.contrastText,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon sx={{ fontSize: 20 }} />
              </Box>
            )}
            <Box sx={{ minWidth: 0 }}>
              {eyebrow && <SectionLabel sx={{ mb: 0.5 }}>{eyebrow}</SectionLabel>}
              {title && <DisplayHeading size="card">{title}</DisplayHeading>}
              {subtitle && (
                <Typography
                  sx={{
                    color: 'text.secondary',
                    fontSize: '0.875rem',
                    mt: 0.5,
                    lineHeight: 1.5,
                  }}
                >
                  {subtitle}
                </Typography>
              )}
            </Box>
          </Box>
          {!disableClose && (
            <IconButton
              onClick={onClose}
              size="small"
              aria-label="Close dialog"
              sx={{
                color: 'text.secondary',
                flexShrink: 0,
                transition: 'all 180ms ease',
                '&:hover': {
                  color: 'text.primary',
                  backgroundColor: 'action.hover',
                },
              }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      )}

      {/* Body */}
      <DialogContent
        sx={{
          px: { xs: 3, sm: 3.5 },
          py: { xs: 2.5, sm: 3 },
          ...contentSx,
        }}
      >
        {children}
      </DialogContent>

      {/* Actions */}
      {actions && (
        <DialogActions
          sx={{
            px: { xs: 3, sm: 3.5 },
            py: { xs: 2, sm: 2.5 },
            pb: `calc(${theme.spacing(2)} + var(--safe-area-inset-bottom, 0px))`,
            borderTop: `1px dashed ${theme.palette.divider}`,
            gap: 1,
            backgroundColor: (t) => t.palette.mode === 'dark'
              ? 'rgba(255,255,255,0.02)'
              : 'rgba(0,0,0,0.015)',
          }}
        >
          {actions}
        </DialogActions>
      )}
    </Dialog>
  );
};

export default PremiumDialog;
