import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl
} from '@mui/material';

const RecurringEditDialog = ({ open, actionType, onClose, onConfirm }) => {
  const [editScope, setEditScope] = React.useState('THIS_INSTANCE');

  const handleConfirm = () => {
    onConfirm(editScope);
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>
        {actionType === 'delete' ? 'Delete recurring task' : 'Edit recurring task'}
      </DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          This is a repeating task. Do you want to {actionType} just this instance, or the entire series?
        </DialogContentText>
        <FormControl>
          <RadioGroup
            value={editScope}
            onChange={(e) => setEditScope(e.target.value)}
          >
            <FormControlLabel 
              value="THIS_INSTANCE" 
              control={<Radio />} 
              label="This instance only" 
            />
            <FormControlLabel 
              value="ALL_INSTANCES" 
              control={<Radio />} 
              label="All instances in series" 
            />
          </RadioGroup>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleConfirm} variant="contained" color="primary">
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RecurringEditDialog;
