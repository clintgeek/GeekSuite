import { useState } from 'react';
import {
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';

function Databases() {
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

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Host</TableCell>
              <TableCell>Port</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {databases.map((db) => (
              <TableRow key={db.id}>
                <TableCell>{db.name}</TableCell>
                <TableCell>{db.type}</TableCell>
                <TableCell>{db.host}</TableCell>
                <TableCell>{db.port}</TableCell>
                <TableCell>{db.status}</TableCell>
                <TableCell>
                  <IconButton size="small" color="primary">
                    <EditIcon />
                  </IconButton>
                  <IconButton size="small" color="error">
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={handleClose}>
        <DialogTitle>Add New Database</DialogTitle>
        <DialogContent>
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
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button onClick={handleClose} variant="contained">Add</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

export default Databases;