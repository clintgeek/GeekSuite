import { useId, useState } from 'react';
import {
  Button,
  Typography,
  IconButton,
  TextField
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import ConsoleDialog from '../components/primitives/ConsoleDialog';
import ResponsiveTable from '../components/primitives/ResponsiveTable';

const COLUMNS = [
  { key: 'name', label: 'Name', card: false },
  { key: 'type', label: 'Type' },
  { key: 'host', label: 'Host' },
  { key: 'port', label: 'Port' },
  { key: 'status', label: 'Status' },
];

function Databases() {
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [databases, setDatabases] = useState([
    {
      id: 1,
      name: 'NoteGeek DB',
      type: 'mongodb',
      host: 'localhost',
      port: 27017,
      status: 'active'
    },
    {
      id: 2,
      name: 'BuJoGeek DB',
      type: 'mongodb',
      host: 'localhost',
      port: 27017,
      status: 'active'
    }
  ]);

  const handleClickOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleClose();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Typography variant="h4">
          Databases
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleClickOpen}
        >
          Add Database
        </Button>
      </div>

      <ResponsiveTable
        columns={COLUMNS}
        rows={databases}
        renderCardHeader={(db) => (
          <Typography sx={{ fontWeight: 600, fontSize: '0.9rem', color: 'text.primary' }}>
            {db.name}
          </Typography>
        )}
        renderActions={() => (
          <>
            <IconButton size="small" color="primary" sx={{ minWidth: 44, minHeight: 44 }}>
              <EditIcon />
            </IconButton>
            <IconButton size="small" color="error" sx={{ minWidth: 44, minHeight: 44 }}>
              <DeleteIcon />
            </IconButton>
          </>
        )}
      />

      <ConsoleDialog
        open={open}
        onClose={handleClose}
        eyebrow="Database"
        title="Add database"
        primaryAction={
          <Button type="submit" form={formId} variant="contained">Add</Button>
        }
        secondaryAction={<Button onClick={handleClose}>Cancel</Button>}
      >
        <form id={formId} onSubmit={handleSubmit}>
          <TextField
            autoFocus
            margin="dense"
            label="Database Name"
            fullWidth
            variant="outlined"
          />
          <TextField
            margin="dense"
            label="Type"
            select
            fullWidth
            variant="outlined"
            SelectProps={{
              native: true,
            }}
          >
            <option value="mongodb">MongoDB</option>
            <option value="postgresql">PostgreSQL</option>
          </TextField>
          <TextField
            margin="dense"
            label="Host"
            fullWidth
            variant="outlined"
          />
          <TextField
            margin="dense"
            label="Port"
            type="number"
            fullWidth
            variant="outlined"
          />
          <TextField
            margin="dense"
            label="Username"
            fullWidth
            variant="outlined"
          />
          <TextField
            margin="dense"
            label="Password"
            type="password"
            fullWidth
            variant="outlined"
          />
        </form>
      </ConsoleDialog>
    </div>
  );
}

export default Databases;
