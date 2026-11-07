/**
 * AttentionSeverityError.test.jsx — the `error` severity (2026-11-06).
 *
 * `/api/ai/status` gained an error-level item, `key_unreadable`: a stored
 * provider key no longer decrypts, which usually means KEY_VAULT_SECRET is
 * wrong. The UI only knew `warn` and `info`, so it fell back to info and the
 * one alert that means "the AI is about to stop working" read "For
 * information". These cases pin that an error is never quieter than a warning.
 */
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import AttentionPanel from '../../../pages/aigeek/AttentionPanel';
import { annunciate, lineStatus } from '../../../signalbox/readings';
import { renderWithProviders } from '../../testUtils';

const ERROR_ITEM = {
  kind: 'key_unreadable',
  severity: 'error',
  text: 'groq: stored key will not decrypt — check KEY_VAULT_SECRET',
};

describe('an error-severity attention item', () => {
  it('is announced as an error, not "For information"', () => {
    renderWithProviders(<AttentionPanel status={{ attention: [ERROR_ITEM], catalog: {} }} />);
    expect(screen.getByText(/^Error:/)).toBeInTheDocument();
    expect(screen.queryByText(/For information/)).not.toBeInTheDocument();
  });

  it('lights its annunciator tile at least as loud as a warning', () => {
    const tile = annunciate([ERROR_ITEM]).find((t) => t.kind === 'key_unreadable');
    expect(tile).toMatchObject({ lit: true, severity: 'warn' });
  });

  it('counts on the line status like a warning does', () => {
    expect(lineStatus({ lamps: [], attention: [ERROR_ITEM] }).message).toMatch(/1 caution/);
  });
});
