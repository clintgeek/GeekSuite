import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import {
  TextField,
  Button,
  Stack,
  MenuItem,
  Typography,
  Box,
  Card,
  CardContent,
  Grid,
  Chip,
  Avatar
} from '@mui/material';
import EggIcon from '@mui/icons-material/Egg';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import PageCard from '../components/PageCard.jsx';

const HatchEventCard = ({ event }) => {
  const getStatusColor = () => {
    if (event.chicksHatched != null) return 'success';
    if (event.hatchDate) return 'warning';
    return 'info';
  };

  const getStatusLabel = () => {
    if (event.chicksHatched != null) return 'Completed';
    if (event.hatchDate) return 'Hatching';
    return 'Incubating';
  };

  const calculateHatchRate = () => {
    if (event.eggsFertile && event.chicksHatched != null) {
      return Math.round((event.chicksHatched / event.eggsFertile) * 100);
    }
    return null;
  };

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.2s ease-in-out',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: 3
        }
      }}
    >
      <CardContent>
        <Stack spacing={2}>
          {/* Header */}
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
            <Avatar sx={{ bgcolor: 'primary.main' }}>
              <EggIcon />
            </Avatar>
            <Chip
              label={getStatusLabel()}
              size="small"
              color={getStatusColor()}
              variant="filled"
            />
          </Stack>

          {/* Event Info */}
          <Stack spacing={1}>
            <Typography variant="h6" component="div">
              {event.eggsSet} Eggs Set
            </Typography>

            <Stack direction="row" spacing={1} alignItems="center">
              <CalendarTodayIcon fontSize="small" color="action" />
              <Typography variant="body2" color="text.secondary">
                Set: {new Date(event.setDate).toLocaleDateString()}
              </Typography>
            </Stack>

            {event.hatchDate && (
              <Stack direction="row" spacing={1} alignItems="center">
                <CalendarTodayIcon fontSize="small" color="action" />
                <Typography variant="body2" color="text.secondary">
                  Hatch: {new Date(event.hatchDate).toLocaleDateString()}
                </Typography>
              </Stack>
            )}

            {/* Results */}
            {event.chicksHatched != null && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="body2" fontWeight="bold">
                  Results:
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 0.5, mt: 0.5 }}>
                  {event.eggsFertile && (
                    <Chip label={`${event.eggsFertile} fertile`} size="small" variant="outlined" />
                  )}
                  <Chip label={`${event.chicksHatched} hatched`} size="small" color="success" variant="outlined" />
                  {event.pullets && (
                    <Chip label={`${event.pullets} pullets`} size="small" color="secondary" variant="outlined" />
                  )}
                  {event.cockerels && (
                    <Chip label={`${event.cockerels} cockerels`} size="small" color="primary" variant="outlined" />
                  )}
                </Stack>

                {calculateHatchRate() && (
                  <Typography variant="body2" color="success.main" sx={{ mt: 1, fontWeight: 'bold' }}>
                    Hatch Rate: {calculateHatchRate()}%
                  </Typography>
                )}
              </Box>
            )}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
};

export default function HatchLogPage() {
  const [pairings, setPairings] = useState([]);
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState({ pairingId: '', setDate: new Date().toISOString().slice(0,10), eggsSet: 0 });
  const [outcome, setOutcome] = useState({ id: '', hatchDate: '', eggsFertile: '', chicksHatched: '', pullets: '', cockerels: '' });

  async function load() {
    const ps = await api.listPairings();
    setPairings(ps);
    if (!form.pairingId && ps.length) setForm(f => ({ ...f, pairingId: ps[0]._id }));
    const res = await fetch('/api/flockgeek/v1/hatch-events', { headers: { 'X-Owner-Id': localStorage.getItem('ownerId') || 'demo-owner' } });
    const json = await res.json();
    setEvents(json.data.items);
  }
  useEffect(() => { load(); }, []);

  async function onCreate(e) {
    e.preventDefault();
    await api.createHatchEvent({ pairingId: form.pairingId || undefined, setDate: form.setDate, eggsSet: Number(form.eggsSet) });
    setForm({ ...form, eggsSet: 0 });
    load();
  }

  async function onUpdateOutcome(e) {
    e.preventDefault();
    if (!outcome.id) return;
    await api.updateHatchOutcome(outcome.id, {
      hatchDate: outcome.hatchDate || undefined,
      eggsFertile: outcome.eggsFertile ? Number(outcome.eggsFertile) : undefined,
      chicksHatched: outcome.chicksHatched ? Number(outcome.chicksHatched) : undefined,
      pullets: outcome.pullets ? Number(outcome.pullets) : undefined,
      cockerels: outcome.cockerels ? Number(outcome.cockerels) : undefined,
    });
    setOutcome({ id: '', hatchDate: '', eggsFertile: '', chicksHatched: '', pullets: '', cockerels: '' });
    load();
  }

  return (
    <Stack spacing={4}>
      <PageCard title="Set Hatch">
        <form onSubmit={onCreate}>
          <Stack spacing={3}>
            <TextField
              select
              label="Pairing"
              value={form.pairingId}
              onChange={e => setForm({ ...form, pairingId: e.target.value })}
              fullWidth
            >
              {pairings.map(p => (
                <MenuItem key={p._id} value={p._id}>
                  {p.name || p.season}
                </MenuItem>
              ))}
            </TextField>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3}>
              <TextField
                label="Set Date"
                type="date"
                value={form.setDate}
                onChange={e => setForm({ ...form, setDate: e.target.value })}
                sx={{ flexGrow: 1 }}
              />
              <TextField
                label="Eggs Set"
                type="number"
                value={form.eggsSet}
                onChange={e => setForm({ ...form, eggsSet: e.target.value })}
                sx={{ flexGrow: 1 }}
              />
              <Button
                type="submit"
                variant="contained"
                size="large"
                sx={{ minWidth: 120 }}
              >
                Set Eggs
              </Button>
            </Stack>
          </Stack>
        </form>
      </PageCard>

      <PageCard title="Update Outcome">
        <form onSubmit={onUpdateOutcome}>
          <Stack spacing={3}>
            <TextField
              select
              label="Select Event to Update"
              value={outcome.id}
              onChange={e => setOutcome({ ...outcome, id: e.target.value })}
              fullWidth
            >
              {events.map(ev => (
                <MenuItem key={ev._id} value={ev._id}>
                  {new Date(ev.setDate).toLocaleDateString()} — {ev.eggsSet} eggs set
                </MenuItem>
              ))}
            </TextField>

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Hatch Date"
                  type="date"
                  value={outcome.hatchDate}
                  onChange={e => setOutcome({ ...outcome, hatchDate: e.target.value })}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Fertile Eggs"
                  type="number"
                  value={outcome.eggsFertile}
                  onChange={e => setOutcome({ ...outcome, eggsFertile: e.target.value })}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Chicks Hatched"
                  type="number"
                  value={outcome.chicksHatched}
                  onChange={e => setOutcome({ ...outcome, chicksHatched: e.target.value })}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Pullets"
                  type="number"
                  value={outcome.pullets}
                  onChange={e => setOutcome({ ...outcome, pullets: e.target.value })}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Cockerels"
                  type="number"
                  value={outcome.cockerels}
                  onChange={e => setOutcome({ ...outcome, cockerels: e.target.value })}
                  fullWidth
                />
              </Grid>
            </Grid>

            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={!outcome.id}
            >
              Update Outcome
            </Button>
          </Stack>
        </form>
      </PageCard>

      <PageCard title={`Hatch Events (${events.length})`}>
        <Grid container spacing={3}>
          {events.map((event) => (
            <Grid item xs={12} sm={6} md={4} key={event._id}>
              <HatchEventCard event={event} />
            </Grid>
          ))}
          {events.length === 0 && (
            <Grid item xs={12}>
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <EggIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  No hatch events found
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Set your first batch of eggs using the form above
                </Typography>
              </Box>
            </Grid>
          )}
        </Grid>
      </PageCard>
    </Stack>
  );
}
