import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Popover,
  Stack,
  Typography
} from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

const fullCodes = [
  { section: 'Entry Type (first character)' },
  { code: '*', meaning: 'Task (default if omitted)' },
  { code: '@', meaning: 'Event / Appointment' },
  { code: '-', meaning: 'Note' },
  { code: '?', meaning: 'Question / Follow-up' },
  { code: '!', meaning: 'Important' },
  { section: 'Due Date' },
  { code: '/today', meaning: 'Today' },
  { code: '/tomorrow', meaning: 'Tomorrow' },
  { code: '/monday … /sunday', meaning: 'Next occurrence of that day (abbrevs ok)' },
  { code: '/next-week', meaning: '+7 days' },
  { code: '/next-month', meaning: '+1 month' },
  { code: '/2026-03-15', meaning: 'ISO date (YYYY-MM-DD)' },
  { code: '/03-15', meaning: 'Month-day (current year)' },
  { code: '/mar 5th', meaning: 'Month name + day (ordinals ok)' },
  { section: 'Time (after a date)' },
  { code: '9am', meaning: 'Hour with am/pm' },
  { code: '14:30', meaning: '24-hour time' },
  { code: '2:30pm', meaning: 'Hour:min with am/pm' },
  { section: 'Priority' },
  { code: '!high', meaning: 'High priority' },
  { code: '!medium', meaning: 'Medium priority' },
  { code: '!low', meaning: 'Low priority' },
  { section: 'Other' },
  { code: '#tag', meaning: 'Tag (e.g. #work, #errand)' },
  { code: '^note text', meaning: 'Append a note to the task' },
];



const TaskInputHelpButton = ({ compact = false }) => {
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  const handleOpen = (event) => setAnchorEl(event.currentTarget);
  const handleClose = () => setAnchorEl(null);

  return (
    <>
      {compact ? (
        <IconButton size="small" onClick={handleOpen} aria-label="Show task input codes">
          <HelpOutlineIcon fontSize="small" />
        </IconButton>
      ) : (
        <Button
          size="small"
          variant="outlined"
          startIcon={<HelpOutlineIcon fontSize="small" />}
          onClick={handleOpen}
        >
          Input Codes
        </Button>
      )}

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{
          sx: {
            width: 360,
            maxWidth: 'calc(100vw - 32px)',
            p: 2,
            borderRadius: 2
          }
        }}
      >
        <Stack spacing={1.5}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Quick Add Codes
            </Typography>
            <Chip size="small" label="Enter to save" />
          </Box>

          <Divider />

          <List dense sx={{ py: 0 }}>
            {fullCodes.map((item, idx) =>
              item.section ? (
                <ListItem key={item.section} disableGutters sx={{ pt: idx === 0 ? 0 : 1, pb: 0.25 }}>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.6875rem' }}
                  >
                    {item.section}
                  </Typography>
                </ListItem>
              ) : (
                <ListItem key={item.code} disableGutters sx={{ py: 0.25 }}>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                        <Typography
                          component="span"
                          sx={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.8125rem',
                            px: 0.75,
                            py: 0.25,
                            borderRadius: 1,
                            bgcolor: 'action.hover',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.code}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {item.meaning}
                        </Typography>
                      </Box>
                    }
                  />
                </ListItem>
              )
            )}
          </List>
        </Stack>
      </Popover>
    </>
  );
};

export default TaskInputHelpButton;
