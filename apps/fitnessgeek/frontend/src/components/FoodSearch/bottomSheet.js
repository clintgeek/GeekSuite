/**
 * A small MUI Dialog as a bottom sheet on a phone (review 2026-11-27): full
 * width, anchored to the bottom edge, rounded only on top, clear of the home
 * indicator — so its action is under the thumb, like the add sheet's. From
 * `sm` up it is the usual centred window.
 *
 * Spread onto a `<Dialog>`:  <Dialog {...bottomSheetProps} …>
 */
export const bottomSheetProps = {
  sx: { '& .MuiDialog-container': { alignItems: { xs: 'flex-end', sm: 'center' } } },
  PaperProps: {
    sx: {
      // `&&` outranks the Dialog's own paper width, margin and max-width.
      '&&': {
        m: { xs: 0, sm: '32px' },
        width: { xs: '100%', sm: 'calc(100% - 64px)' },
        maxWidth: { xs: '100%', sm: 444 },
        maxHeight: { xs: 'calc(100% - 24px)', sm: 'calc(100% - 64px)' },
        borderRadius: { xs: '16px 16px 0 0', sm: '16px' },
        pb: { xs: 'env(safe-area-inset-bottom, 0px)', sm: 0 },
      },
    },
  },
};

export default bottomSheetProps;
