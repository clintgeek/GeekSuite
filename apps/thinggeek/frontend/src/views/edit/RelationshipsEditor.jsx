/**
 * The relationships editor. A relationship is stored once, on the thing
 * that says it; this edits the ones THIS thing says ("Wendy is equipped
 * with …"). The ones other things say about it ("… is part of Wendy") are
 * listed read-only with where to change them — they are derived, and
 * editing them here would store them twice.
 */
import React, { useMemo, useState } from 'react';
import { Autocomplete, Box, IconButton, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import { Add as AddIcon, DeleteOutline as RemoveIcon } from '@mui/icons-material';
import { useQuery } from '@apollo/client';
import { useDebouncedValue } from '@geeksuite/collection';
import { SEARCH_THINGS } from '../../graphql/queries';
import TypeIcon from '../../components/TypeIcon';
import { RELATIONSHIP_KIND_LABELS, relationshipPhrase } from '../../utils/relationships';

function ThingSearch({ excludeIds, onPick }) {
  const [input, setInput] = useState('');
  const q = useDebouncedValue(input.trim(), 250);
  const { data, loading } = useQuery(SEARCH_THINGS, {
    variables: { filter: q ? { q } : null, limit: 12 },
    fetchPolicy: 'cache-and-network',
  });
  const options = useMemo(() => (data?.things?.things ?? []).filter((t) => !excludeIds.has(t.id)), [data, excludeIds]);
  return (
    <Autocomplete
      options={options}
      loading={loading}
      value={null}
      inputValue={input}
      onInputChange={(_e, v, reason) => reason !== 'reset' && setInput(v)}
      onChange={(_e, t) => {
        if (t) {
          onPick(t);
          setInput('');
        }
      }}
      filterOptions={(x) => x}
      getOptionLabel={(t) => t?.name ?? ''}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      noOptionsText={q ? 'No thing by that name' : 'Type to find a thing'}
      renderOption={(props, t) => {
        const { key, ...rest } = props;
        return (
          <Box component="li" key={key} {...rest} sx={{ display: 'flex', gap: 1, alignItems: 'center', minHeight: 44 }}>
            <TypeIcon name={t.type?.icon} sx={{ fontSize: 18, color: 'text.secondary' }} />
            <span>{t.name}</span>
            {t.type ? (
              <Box component="span" sx={{ ml: 'auto', fontSize: '0.75rem', color: 'text.secondary' }}>
                {t.type.name}
              </Box>
            ) : null}
          </Box>
        );
      }}
      renderInput={(params) => <TextField {...params} size="small" label="Other thing" placeholder="Garmin Striker 4" />}
      sx={{ flex: 1, minWidth: 0 }}
    />
  );
}

let tmp = 0;

export default function RelationshipsEditor({ thingId, rows, onChange, incoming = [], kinds }) {
  const [kind, setKind] = useState(kinds[0] ?? 'equipped-with');
  const excludeIds = useMemo(() => new Set([thingId, ...rows.filter((r) => r.kind === kind).map((r) => r.thing.id)]), [thingId, rows, kind]);

  const add = (thing) => {
    tmp += 1;
    onChange([...rows, { key: `rel-${tmp}`, kind, thing }]);
  };

  return (
    <Box sx={{ display: 'grid', gap: 1.25 }}>
      {rows.length ? (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.75 }}>
          {rows.map((r) => (
            <Box component="li" key={r.key} data-testid="relationship-editor-row" sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 44, pl: 1.25, borderRadius: 2, border: 1, borderColor: 'divider' }}>
              <Typography sx={{ flex: 1, minWidth: 0, fontSize: '0.875rem' }}>
                <Box component="span" sx={{ color: 'text.secondary' }}>
                  {relationshipPhrase(r.kind, 'out')}{' '}
                </Box>
                <Box component="span" sx={{ fontWeight: 700 }}>
                  {r.thing.name}
                </Box>
              </Typography>
              <Tooltip title="Remove">
                <IconButton onClick={() => onChange(rows.filter((x) => x.key !== r.key))} aria-label={`Remove: ${relationshipPhrase(r.kind, 'out')} ${r.thing.name}`} sx={{ color: 'text.secondary' }}>
                  <RemoveIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          ))}
        </Box>
      ) : null}

      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1, alignItems: { sm: 'center' } }}>
        <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', flexShrink: 0 }}>This thing</Typography>
        <TextField select size="small" label="Relationship" value={kind} onChange={(e) => setKind(e.target.value)} sx={{ minWidth: 200 }}>
          {kinds.map((k) => (
            <MenuItem key={k} value={k}>
              {RELATIONSHIP_KIND_LABELS[k] ?? k}
            </MenuItem>
          ))}
        </TextField>
        <ThingSearch excludeIds={excludeIds} onPick={add} />
      </Box>

      {incoming.length ? (
        <Box sx={{ mt: 0.5 }}>
          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 0.5 }}>Set on the other thing (edit them there):</Typography>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {incoming.map((r) => (
              <Typography component="li" key={r.id} sx={{ fontSize: '0.8125rem', color: 'text.primary' }}>
                {relationshipPhrase(r.kind, 'in')} {r.thing.name}
              </Typography>
            ))}
          </Box>
        </Box>
      ) : null}

      {!rows.length && !incoming.length ? (
        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
          <AddIcon sx={{ fontSize: 14, verticalAlign: '-2px', mr: 0.25 }} aria-hidden="true" />
          Pick a relationship, then find the other thing.
        </Typography>
      ) : null}
    </Box>
  );
}
