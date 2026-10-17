import React from 'react';
import { Button } from '@mui/material';
import { loginRedirect } from '@geeksuite/auth';
import { SIGNED_OUT_MESSAGE } from '../../utils/errorMessage.js';

/**
 * "Please sign in again." with something to tap (L24). The message used to
 * stand alone, and the only way back was knowing to reload. This sends her to
 * the suite sign-in and back to the page she was on — the same redirect the
 * REST client uses on a 401. Her words survive the trip: the add sheet keeps
 * its draft in sessionStorage.
 */
export const isSignedOutMessage = (text) => text === SIGNED_OUT_MESSAGE;

export function signIn() {
  loginRedirect('fitnessgeek', window.location.href);
}

export default function SignInButton({ sx, ...props }) {
  return (
    <Button
      variant="contained"
      onClick={signIn}
      data-testid="sign-in-again"
      sx={{ minHeight: 44, borderRadius: 999, fontWeight: 800, boxShadow: 'none', ...sx }}
      {...props}
    >
      Sign in
    </Button>
  );
}
