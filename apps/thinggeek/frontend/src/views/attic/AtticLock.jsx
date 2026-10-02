/**
 * The Attic's lock, on screen:
 *
 *   AtticGate    renders its children only while the vault is unlocked;
 *                otherwise the set-up (first visit) or the locked door.
 *   LockedDoor   the steel door with its padlock: "Unlock with fingerprint"
 *                (a passkey — WebAuthn, the phone asks for the fingerprint
 *                or face) and "Use PIN".
 *   AtticSetup   first visit: add a fingerprint (passkey), then a backup PIN.
 *   LockBar      while unlocked: "Locks in 9:41" and the Lock button; it
 *                tells the server about activity so the countdown restarts.
 *
 * The SERVER enforces all of it; these screens only ask.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, TextField, Typography } from '@mui/material';
import { FingerprintOutlined as FingerprintIcon, LockOutlined as LockIcon, PinOutlined as PinIcon } from '@mui/icons-material';
import { GeekSheet } from '@geeksuite/ui';
import { formatCountdown, useCountdown, useVault } from '../../hooks/useVault';
import { DISPLAY_FONT, LIVERY } from '../../theme/theme';
import PageHeader, { PageFrame } from '../../components/PageHeader';
import AtticDoor from './AtticDoor';

export const HERO_BUTTON_SX = {
  minHeight: 52,
  bgcolor: 'hero.main',
  color: 'hero.contrastText',
  border: `2px solid ${LIVERY.ink}`,
  fontSize: '1rem',
  fontWeight: 800,
  '&:hover': { bgcolor: 'hero.dark' },
};

const outlineSx = { minHeight: 48, color: 'text.primary', borderColor: 'border', fontWeight: 700 };

function errorText(err) {
  if (!err) return '';
  if (err.code === 'PIN_LOCKED' || err.body?.code === 'PIN_LOCKED') {
    const at = err.body?.retryAt ? new Date(err.body.retryAt) : null;
    const secs = at ? Math.max(1, Math.round((at.getTime() - Date.now()) / 1000)) : null;
    return `Too many wrong PINs. Try again ${secs ? `in ${secs > 90 ? `${Math.ceil(secs / 60)} minutes` : `${secs} seconds`}` : 'later'}, or use your fingerprint.`;
  }
  if (err.code === 'PIN_WRONG' || err.body?.code === 'PIN_WRONG') {
    const left = err.body?.attemptsLeft;
    return left > 0 ? `Wrong PIN. ${left} more ${left === 1 ? 'try' : 'tries'} before it pauses.` : 'Wrong PIN. The PIN is paused for a little while.';
  }
  return err.message || 'That didn’t work. Try again.';
}

/** A PIN field: digits only, masked, no autofill (it is not a password to save). */
export function PinField({ value, onChange, label = 'PIN', autoFocus, id = 'attic-pin', helperText, error }) {
  return (
    <TextField
      id={id}
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 12))}
      type="password"
      autoFocus={autoFocus}
      autoComplete="off"
      error={Boolean(error)}
      helperText={helperText}
      inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', maxLength: 12, 'data-lpignore': 'true', 'data-1p-ignore': 'true', style: { letterSpacing: '0.3em', fontSize: '1.25rem' } }}
      fullWidth
    />
  );
}

function PinSheet({ open, onClose }) {
  const vault = useVault();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!open) {
      setPin('');
      setErr(null);
    }
  }, [open]);
  const submit = async (e) => {
    e?.preventDefault();
    if (pin.length < 6) return;
    setBusy(true);
    setErr(null);
    try {
      await vault.unlockWithPin(pin);
      onClose();
    } catch (error) {
      setErr(error);
      setPin('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <GeekSheet
      open={open}
      onClose={onClose}
      title="Unlock with your PIN"
      actions={
        <Button type="submit" form="attic-pin-form" variant="contained" disabled={busy || pin.length < 6} sx={HERO_BUTTON_SX}>
          {busy ? 'Checking…' : 'Unlock'}
        </Button>
      }
    >
      <Box component="form" id="attic-pin-form" onSubmit={submit} sx={{ display: 'grid', gap: 1.5, pt: 1 }}>
        <PinField value={pin} onChange={setPin} autoFocus helperText="6 to 12 digits." />
        {err ? (
          <Alert severity="error" role="alert">
            {errorText(err)}
          </Alert>
        ) : null}
      </Box>
    </GeekSheet>
  );
}

export function LockedDoor({ what = 'The Attic' }) {
  const vault = useVault();
  const [pinOpen, setPinOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const hasPasskey = vault.passkeys?.length > 0 && vault.passkeysSupported;

  const passkey = async () => {
    setBusy(true);
    setErr(null);
    try {
      await vault.unlockWithPasskey();
    } catch (error) {
      setErr(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box data-testid="attic-locked" sx={{ display: 'grid', gap: 2, maxWidth: 440, mx: 'auto', textAlign: 'center' }}>
      <AtticDoor />
      <Box>
        <Typography component="h2" sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: '1.5rem', lineHeight: 1.2 }}>
          {what} is locked
        </Typography>
        <Typography sx={{ mt: 0.75, color: 'text.secondary', fontSize: '0.9375rem', lineHeight: 1.55 }}>
          Passports, cards, policies and certificates. Sealed on the server, opened only for you, and locked again after ten quiet minutes.
        </Typography>
      </Box>
      <Box sx={{ display: 'grid', gap: 1 }}>
        {hasPasskey ? (
          <Button variant="contained" onClick={passkey} disabled={busy} startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <FingerprintIcon />} sx={HERO_BUTTON_SX}>
            Unlock with fingerprint
          </Button>
        ) : null}
        {vault.pin ? (
          <Button variant={hasPasskey ? 'outlined' : 'contained'} onClick={() => setPinOpen(true)} startIcon={<PinIcon />} sx={hasPasskey ? outlineSx : HERO_BUTTON_SX}>
            Use PIN
          </Button>
        ) : null}
        {err ? (
          <Alert severity="error" role="alert" sx={{ textAlign: 'left' }}>
            {errorText(err)}
          </Alert>
        ) : null}
      </Box>
      <PinSheet open={pinOpen} onClose={() => setPinOpen(false)} />
    </Box>
  );
}

export function AtticSetup() {
  const vault = useVault();
  const [step, setStep] = useState(vault.passkeysSupported && !vault.passkeys?.length ? 'passkey' : 'pin');
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const addPasskey = async () => {
    setBusy(true);
    setErr(null);
    try {
      await vault.registerPasskey('This phone');
      setStep('pin');
    } catch (error) {
      setErr(error);
    } finally {
      setBusy(false);
    }
  };

  const savePin = async (e) => {
    e?.preventDefault();
    if (pin !== again) {
      setErr({ message: 'The two PINs don’t match.' });
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await vault.setPin(pin);
    } catch (error) {
      setErr(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box data-testid="attic-setup" sx={{ display: 'grid', gap: 2, maxWidth: 480, mx: 'auto' }}>
      <AtticDoor label="NEW UNIT" />
      <Box sx={{ textAlign: 'center' }}>
        <Typography component="h2" sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: '1.5rem', lineHeight: 1.2 }}>
          Put a lock on the Attic
        </Typography>
        <Typography sx={{ mt: 0.75, color: 'text.secondary', fontSize: '0.9375rem', lineHeight: 1.55 }}>
          The family’s documents live behind this door. You open it with your fingerprint, or a PIN when the fingerprint won’t do. Your lock is yours: Heather sets up her own.
        </Typography>
      </Box>
      <Box component="ol" aria-label="Set-up steps" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}>
        <Box component="li" data-step="passkey" data-current={step === 'passkey' ? 'true' : 'false'} sx={{ border: 1, borderColor: 'border', borderRadius: '4px', bgcolor: 'background.card', p: 2 }}>
          <Typography sx={{ fontWeight: 800 }}>1. Add your fingerprint</Typography>
          <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', mt: 0.25 }}>
            {vault.passkeysSupported ? 'A passkey on this phone. Your fingerprint never leaves it.' : 'This browser can’t make passkeys. Use a PIN for now; add a fingerprint later from your phone.'}
          </Typography>
          {step === 'passkey' ? (
            <Box sx={{ display: 'grid', gap: 1, mt: 1.5 }}>
              <Button variant="contained" onClick={addPasskey} disabled={busy} startIcon={<FingerprintIcon />} sx={HERO_BUTTON_SX}>
                Add fingerprint
              </Button>
              <Button onClick={() => setStep('pin')} sx={{ minHeight: 44, color: 'text.primary' }}>
                Skip — PIN only for now
              </Button>
            </Box>
          ) : vault.passkeys?.length ? (
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, mt: 0.5 }}>Done.</Typography>
          ) : null}
        </Box>
        <Box component="li" data-step="pin" data-current={step === 'pin' ? 'true' : 'false'} sx={{ border: 1, borderColor: 'border', borderRadius: '4px', bgcolor: 'background.card', p: 2 }}>
          <Typography sx={{ fontWeight: 800 }}>2. Choose a backup PIN</Typography>
          <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', mt: 0.25 }}>6 to 12 digits — not a birthday, not 123456. Wrong guesses pause the PIN.</Typography>
          {step === 'pin' ? (
            <Box component="form" onSubmit={savePin} sx={{ display: 'grid', gap: 1.5, mt: 1.5 }}>
              <PinField id="attic-new-pin" label="New PIN" value={pin} onChange={setPin} />
              <PinField id="attic-new-pin-again" label="The same PIN again" value={again} onChange={setAgain} />
              <Button type="submit" variant="contained" disabled={busy || pin.length < 6 || again.length < 6} startIcon={<LockIcon />} sx={HERO_BUTTON_SX}>
                Set the PIN and open the Attic
              </Button>
            </Box>
          ) : null}
        </Box>
      </Box>
      {err ? (
        <Alert severity="error" role="alert">
          {errorText(err)}
        </Alert>
      ) : null}
    </Box>
  );
}

/** While unlocked: the countdown, and the Lock button. Activity anywhere inside resets the countdown. */
export function LockBar() {
  const vault = useVault();
  const seconds = useCountdown(vault.idleExpiresAt);
  const soon = seconds != null && seconds <= 60;
  return (
    <Box
      data-testid="attic-lockbar"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        mb: 2,
        px: 1.5,
        py: 1,
        borderRadius: '4px',
        bgcolor: 'unit.interior',
        color: 'unit.text',
        border: '2px solid',
        borderColor: 'steel.frame',
        backgroundImage: (t) => `radial-gradient(ellipse at 15% 0%, ${t.palette.unit.glow} 0, rgba(0,0,0,0) 70%)`,
      }}
    >
      <Box aria-hidden="true" sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: soon ? 'marker.soon' : '#FFD28A', boxShadow: '0 0 10px 2px rgba(255,210,138,0.7)', flexShrink: 0 }} />
      <Typography role="timer" aria-live="off" sx={{ flex: 1, minWidth: 0, fontSize: '0.875rem', fontWeight: 700, color: 'unit.text' }}>
        Unlocked{seconds != null ? ` · locks in ${formatCountdown(seconds)}` : ''}
        {soon ? <Box component="span" sx={{ display: 'block', fontWeight: 600, color: 'unit.secondary' }}>Still here? Tap anything to stay open.</Box> : null}
      </Typography>
      <Button
        onClick={() => vault.lock()}
        startIcon={<LockIcon />}
        sx={{ minHeight: 44, px: 2, color: LIVERY.ink, bgcolor: 'hero.main', border: `2px solid ${LIVERY.ink}`, fontWeight: 800, '&:hover': { bgcolor: 'hero.dark' } }}
      >
        Lock
      </Button>
    </Box>
  );
}

/** Children only while unlocked; the door otherwise. Activity inside pings the server. */
export function AtticGate({ children, what, title = 'The Attic' }) {
  const vault = useVault();
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !vault.unlocked) return undefined;
    const onActivity = () => vault.activity();
    el.addEventListener('pointerdown', onActivity);
    el.addEventListener('keydown', onActivity);
    return () => {
      el.removeEventListener('pointerdown', onActivity);
      el.removeEventListener('keydown', onActivity);
    };
  }, [vault, vault.unlocked]);

  let body;
  if (vault.loading) {
    body = (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 280 }}>
        <CircularProgress size={28} aria-label="Checking the lock" />
      </Box>
    );
  } else if (!vault.available) {
    body = (
      <Box sx={{ maxWidth: 440, mx: 'auto', textAlign: 'center', display: 'grid', gap: 2 }}>
        <AtticDoor label="CLOSED" />
        <Typography component="h2" sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: '1.375rem' }}>
          The Attic is closed
        </Typography>
        <Typography sx={{ color: 'text.secondary' }}>The server is missing the Attic’s key, so it won’t open anything. Nothing is lost — ask Chef to set the key and restart ThingGeek.</Typography>
      </Box>
    );
  } else if (!vault.setUp || (vault.unlocked && !vault.pin)) {
    // Set-up runs until the backup PIN exists (a passkey alone opens the door, then asks for it).
    body = <AtticSetup />;
  } else if (!vault.unlocked) {
    body = <LockedDoor what={what} />;
  } else {
    body = (
      <>
        <LockBar />
        {children}
      </>
    );
  }
  return (
    <PageFrame>
      <PageHeader title={title} sx={{ mb: 0 }} />
      <Box ref={ref} data-vault={vault.unlocked ? 'unlocked' : 'locked'}>
        {body}
      </Box>
    </PageFrame>
  );
}
