import { useCallback, useEffect, useState } from 'react';
import { Box, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Plus } from 'lucide-react';
import { GeekSheet, useGeekPrimaryAction } from '@geeksuite/ui';
import InlineQuickAdd from './InlineQuickAdd';

/**
 * QuickAddSheet — the writing surface, moved into the thumb zone.
 *
 * On a phone the inline quick-add sat at the top of the page, the least
 * reachable spot there is (MOBILE_UI_PLAN.md §4). Below `md` the page hides
 * the inline field and mounts this instead: the shell renders a `GeekFab`
 * for the registered primary action, and the FAB opens a `GeekSheet` holding
 * *the same* `InlineQuickAdd` — same parser, same `#`/`@`/`/date` grammar,
 * same tag autocomplete — autofocused, and closing itself once the entry
 * lands.
 *
 * `onAdd` may return `false` to say the entry failed and the sheet should
 * stay open with what the writer typed still on screen; anything else (and a
 * promise for either) closes it. The FAB itself is `showOn: 'mobile'`, so at
 * `md`+ nothing renders and the page's inline field is the only entry point.
 */
const QuickAddSheet = ({
  label = 'Add task',
  sheetTitle = 'New entry',
  onAdd,
  collectionId = null,
  promptLabel,
  placeholder,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [open, setOpen] = useState(false);
  // Focus once the sheet has actually slid in: focusing an input inside a
  // drawer that is still `visibility: hidden` is a no-op, and the sheet's own
  // focus-trap pulls focus to the paper on open.
  const [focusField, setFocusField] = useState(false);

  useEffect(() => {
    if (!open) {
      setFocusField(false);
      return undefined;
    }
    const timer = setTimeout(() => setFocusField(true), 260);
    return () => clearTimeout(timer);
  }, [open]);

  useGeekPrimaryAction({
    label,
    icon: <Plus size={24} strokeWidth={2} />,
    onClick: () => setOpen(true),
  });

  const handleAdd = useCallback(async (taskData) => {
    const result = await onAdd?.(taskData);
    if (result !== false) setOpen(false);
    return result;
  }, [onAdd]);

  // Nothing to mount at desktop widths: the FAB hides itself there and the
  // page's own inline field is back.
  if (!isMobile) return null;

  return (
    <GeekSheet
      open={open}
      onClose={() => setOpen(false)}
      title={sheetTitle}
      snap="content"
      bodySx={{ px: 1.5 }}
    >
      <Box sx={{ pb: 1 }}>
        <InlineQuickAdd
          onAdd={handleAdd}
          collectionId={collectionId}
          promptLabel={promptLabel}
          placeholder={placeholder}
          autoFocus={focusField}
        />
      </Box>
    </GeekSheet>
  );
};

export default QuickAddSheet;
