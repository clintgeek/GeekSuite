/**
 * Details: the type's fields in the type's order, as ruled ledger lines.
 * Identifier fields are masked with a per-field Reveal (IdentifierValue.jsx).
 * Empty fields are not listed one by one — a single quiet line counts them
 * and offers the editor, so a new thing's page is not a column of dashes.
 */
import React from 'react';
import { Box, Button, Link, Typography } from '@mui/material';
import { LockOutlined as LockIcon } from '@mui/icons-material';
import Section, { LedgerRow } from './Section';
import { IdentifierActions, IdentifierText, useIdentifierReveal } from './IdentifierValue';
import { formatAttribute, safeHref } from '../../utils/attributes';
import { hasValue } from '../../utils/identifiers';

export default function DetailsSection({ thing, onEdit }) {
  const reveal = useIdentifierReveal();
  const fields = thing.fields ?? [];
  const filled = fields.filter((f) => hasValue(f.value));
  const empty = fields.length - filled.length;
  const hasIdentifiers = filled.some((f) => f.identifier);

  return (
    <Section id="details" title="Details">
      {filled.length ? (
        <Box>
          {filled.map((f) => {
            if (f.identifier) {
              const revealed = reveal.isRevealed(f.key);
              return (
                <LedgerRow
                  key={f.key}
                  label={f.label}
                  testId={`field-${f.key}`}
                  action={<IdentifierActions label={f.label} value={f.value} revealed={revealed} onToggle={() => reveal.toggle(f.key)} />}
                >
                  <IdentifierText value={f.value} revealed={revealed} />
                </LedgerRow>
              );
            }
            const text = formatAttribute(f, f.value);
            const href = f.kind === 'url' ? safeHref(f.value) : null;
            return (
              <LedgerRow key={f.key} label={f.label} testId={`field-${f.key}`}>
                {href ? (
                  <Link href={href} target="_blank" rel="noopener noreferrer" sx={{ fontWeight: 500 }}>
                    {new URL(href).hostname}
                  </Link>
                ) : (
                  text
                )}
              </LedgerRow>
            );
          })}
        </Box>
      ) : (
        <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
          {fields.length ? 'Nothing filled in yet.' : `${thing.type?.name ?? 'This type'} has no fields of its own — the notes are the place for details.`}
        </Typography>
      )}
      {hasIdentifiers ? (
        <Typography sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1.25, fontSize: '0.75rem', color: 'text.secondary' }}>
          <LockIcon aria-hidden="true" sx={{ fontSize: 14 }} />
          Identifiers stay masked until you reveal them, and are never sent to AI.
        </Typography>
      ) : null}
      {empty > 0 ? (
        <Button onClick={onEdit} size="small" sx={{ mt: 1, ml: -1, color: 'text.primary', fontWeight: 600 }}>
          {empty === 1 ? '1 empty field' : `${empty} empty fields`} — fill in
        </Button>
      ) : null}
    </Section>
  );
}
